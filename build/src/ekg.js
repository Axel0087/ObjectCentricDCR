"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeParallelDFs = exports.arrToDict = void 0;
const loadDB_1 = require("./loadDB");
const utility_1 = require("./utility");
const genEntityId = (rawId, entityType) => {
    return entityType + "_" + rawId;
};
const isDerived = (entityId, entityNodes, model_entities) => {
    return !Object.keys(model_entities).includes(entityNodes[entityId].entityType);
};
exports.default = async (db, include_entities, model_entities, model_relations) => {
    console.log("Extracting event nodes...");
    let t = (0, utility_1.timer)();
    const eventNodes = {};
    const correlations = {};
    const activities = new Set();
    ;
    for (const row of (await (0, loadDB_1.dbFind)(db, { EventOrigin: { $in: include_entities } }))) {
        const activityName = row.Activity + ":" + row.lifecycle;
        let spawnedId = "";
        for (const entity in model_entities) {
            if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer)
                spawnedId = row[model_entities[entity].idField];
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
    const invCorrelations = {};
    // Create Entities
    const entityNodes = {};
    const entityByType = {};
    for (const entityType in model_entities) {
        const { idField, dbDoc } = model_entities[entityType];
        console.log("Extracting entity " + entityType + "...");
        let t = (0, utility_1.timer)();
        entityByType[entityType] = new Set();
        for (const row of (await (0, loadDB_1.dbFind)(db, dbDoc))) {
            const entityId = genEntityId(row[idField], entityType);
            if (entityNodes[entityId] === undefined) {
                entityNodes[entityId] = { entityId, entityType, rawId: row[idField] };
                invCorrelations[entityId] = [];
            }
            entityByType[entityType].add(row[idField]);
            correlations[row.EventID][entityType].add(entityId);
            invCorrelations[entityId].push(eventNodes[row.EventID]);
        }
        console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    }
    // Create Derived entities
    console.log("Extracting derived entities...");
    t = (0, utility_1.timer)();
    const entityRels = {};
    for (const modelRelation of model_relations) {
        const { derivedEntityType, nt1, nt2 } = modelRelation;
        const { idField: key1 } = model_entities[nt1];
        const { dbDoc: doc2, idField: key2 } = model_entities[nt2];
        for (const rawId of entityByType[nt1]) {
            const n1 = genEntityId(rawId, nt1);
            if (!entityRels[n1])
                entityRels[n1] = new Set();
            for (const row of (await (0, loadDB_1.dbFind)(db, { [key1]: rawId, ...doc2 }))) {
                const entityId = genEntityId(rawId + "_" + row[key2], derivedEntityType);
                const n2 = genEntityId(row[key2], nt2);
                // Should do nothing, potentially remove
                if (entityNodes[entityId] !== undefined)
                    continue;
                // Should do nothing, potentially remove
                if (n1 === n2)
                    continue;
                entityNodes[entityId] = { entityId, rawId: "", entityType: derivedEntityType };
                if (!entityRels[n2])
                    entityRels[n2] = new Set();
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
    t = (0, utility_1.timer)();
    const directlyFollows = {};
    const derivedDFs = {};
    for (const entityId in invCorrelations) {
        if (isDerived(entityId, entityNodes, model_entities)) {
            derivedDFs[entityId] = invCorrelations[entityId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }
        else {
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
    };
};
const arrToDict = (eventNodes) => {
    const dict = {};
    for (let i = 1; i < eventNodes.length; i++) {
        dict[eventNodes[i - 1].eventId] = eventNodes[i].eventId;
    }
    return dict;
};
exports.arrToDict = arrToDict;
const removeParallelDFs = (graph) => {
    const newDerivedDfs = {};
    for (const derivedEntityId in graph.derivedDFs) {
        let filteredDFs = (0, exports.arrToDict)(graph.derivedDFs[derivedEntityId]);
        for (const entityId of graph.entityRels[derivedEntityId]) {
            const dfDict = (0, exports.arrToDict)(graph.directlyFollows[entityId]);
            for (const key in dfDict) {
                if (dfDict[key] === filteredDFs[key]) {
                    delete filteredDFs[key];
                }
            }
        }
        newDerivedDfs[derivedEntityId] = filteredDFs;
    }
    return newDerivedDfs;
};
exports.removeParallelDFs = removeParallelDFs;
