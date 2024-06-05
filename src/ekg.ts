import Datastore from "nedb";
import { Activity, Correlations, DirectlyFollows, EntityNodes, EntityRels, EventKnowledgeGraph, EventNode, EventNodes, ModelEntities, ModelRelations } from "../types";
import { dbFind } from "./loadDB";
import { printFull, timer } from "./utility";

const genEntityId = (rawId: string, entityType: string) => {
    return entityType + "_" + rawId;
}

const isDerived = (entityId: string, entityNodes: EntityNodes, model_entities: ModelEntities): boolean => {
    return !Object.keys(model_entities).includes(entityNodes[entityId].entityType);
}

export default async (db: Datastore<any>, include_entities: Array<string>, model_entities: ModelEntities, model_relations: ModelRelations): Promise<EventKnowledgeGraph> => {
    console.log("Extracting event nodes...");
    let t = timer();

    const eventNodes: EventNodes = {};
    const correlations: Correlations = {};
    const activities: Set<Activity> = new Set();;
    for (const row of (await dbFind(db, { EventOrigin: { $in: include_entities } }))) {
        const activityName = row.Activity + ":" + row.lifecycle;
        let spawnedId = "";
        for (const entity in model_entities) {
            if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer) spawnedId = row[model_entities[entity].idField];
        }
        eventNodes[row.EventID] = { eventId: row.EventID, activityName: activityName, timestamp: new Date(row.timestamp), spawnedId };

        activities.add(activityName);
        correlations[row.EventID] = {};
        for (const entityType of include_entities) {
            correlations[row.EventID][entityType] = new Set();
        }
    }
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    // Used for computing DF's
    const invCorrelations: { [entityId: string]: Array<EventNode> } = {};

    // Create Entities
    const entityNodes: EntityNodes = {};
    const entityByType: { [entityType: string]: Set<string> } = {};
    for (const entityType in model_entities) {
        const { idField, dbDoc } = model_entities[entityType];
        console.log("Extracting entity " + entityType + "...");
        let t = timer();
        entityByType[entityType] = new Set();
        for (const row of (await dbFind(db, dbDoc))) {
            const entityId = genEntityId(row[idField], entityType);
            if (entityNodes[entityId] === undefined) {
                entityNodes[entityId] = { entityId, entityType, rawId: row[idField] };
                invCorrelations[entityId] = [];
            }

            entityByType[entityType].add(row[idField]);
            correlations[row.EventID][entityType].add(entityId);
            invCorrelations[entityId].push(eventNodes[row.EventID])
        }
        console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    }

    // Create Derived entities
    console.log("Extracting derived entities...");
    t = timer();
    const entityRels: EntityRels = {};
    for (const modelRelation of model_relations) {
        const { derivedEntityType, nt1, nt2 } = modelRelation;
        const { idField: key1 } = model_entities[nt1];
        const { dbDoc: doc2, idField: key2 } = model_entities[nt2];
        for (const rawId of entityByType[nt1]) {
            const n1 = genEntityId(rawId, nt1);
            if (!entityRels[n1]) entityRels[n1] = new Set();
            for (const row of (await dbFind(db, { [key1]: rawId, ...doc2 }))) {
                const entityId = genEntityId(rawId + "_" + row[key2], derivedEntityType);
                const n2 = genEntityId(row[key2], nt2);

                // Should do nothing, potentially remove
                if (entityNodes[entityId] !== undefined) continue;

                // Should do nothing, potentially remove
                if (n1 === n2) continue;

                entityNodes[entityId] = { entityId, rawId: "", entityType: derivedEntityType };

                if (!entityRels[n2]) entityRels[n2] = new Set();
                entityRels[n1].add(n2);
                entityRels[n2].add(n1);


                // All events that are correlated to n1 and/or n2 are correlated to the derived entity
                // Removing duplicates inline
                const allEvents = [...new Map([...invCorrelations[n1], ...invCorrelations[n2]].slice().reverse().map(v => [v.eventId, v])).values()].reverse();
                invCorrelations[entityId] = allEvents;
                for (const event of allEvents) {
                    correlations[event.eventId][derivedEntityType].add(entityId);
                }
            }
        }
    }
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Computing directly follows...");
    t = timer();
    const directlyFollows: DirectlyFollows = {};
    const derivedDFs: DirectlyFollows = {};
    for (const entityId in invCorrelations) {
        if (isDerived(entityId, entityNodes, model_entities)) {
            derivedDFs[entityId] = invCorrelations[entityId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        } else {
            directlyFollows[entityId] = invCorrelations[entityId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }
    }
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    return {
        activities,
        eventNodes,
        entityTypes: new Set(include_entities),
        entityNodes,
        correlations,
        directlyFollows,
        entityRels,
        derivedDFs
    }
}

export const arrToDict = (eventNodes: Array<EventNode>): { [eventId: string]: string } => {
    const dict: { [eventId: string]: string } = {};
    for (let i = 1; i < eventNodes.length; i++) {
        dict[eventNodes[i - 1].eventId] = eventNodes[i].eventId;
    }
    return dict;
}

export const removeParallelDFs = (graph: EventKnowledgeGraph): { [derivedEntityId: string]: { [eventId: string]: string } } => {
    const newDerivedDfs: { [derivedEntityId: string]: { [eventId: string]: string } } = {};


    for (const derivedEntityId in graph.derivedDFs) {
        let filteredDFs = arrToDict(graph.derivedDFs[derivedEntityId]);

        for (const entityId of graph.entityRels[derivedEntityId]) {
            const dfDict = arrToDict(graph.directlyFollows[entityId]);
            for (const key in dfDict) {
                if (dfDict[key] === filteredDFs[key]) {
                    delete filteredDFs[key];
                }
            }
        }

        newDerivedDfs[derivedEntityId] = filteredDFs;
    }

    return newDerivedDfs;
}