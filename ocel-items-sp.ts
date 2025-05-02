import fs from "fs";
import { EntityRels, EventKnowledgeGraph, EventNode, isEntityRels, ModelEntities, ModelRelations } from "./types";
import { safeAdd } from "./src/utility";
import { aggregateCorrelations, discover, findRelationClosures } from "./src/ocDiscovery";
import { findCardinalities, findTransitiveCardinalities } from "./src/processMining";
import { isDerived } from "./src/ekg";
import { writeSerializedGraph } from "./src/fsInteraction";
import init from "./init";

init();

const include_entities = ['orders', 'items', 'packages', 'OI', 'OP', 'IP'];
const model_entities_derived = ['OI', 'OP', 'IP'];
const subprocess_entities = ['items'];

const items_activities = [
    'item out of stock',
    'pick item',
    'reorder item'
]

const model_entities: ModelEntities = {
    "orders": {
        dbDoc: {},
        idField: "",
    },
    "packages": {
        dbDoc: {},
        idField: "",
    },
    "items": {
        dbDoc: {},
        idField: "",
        subprocessInitializer: "create item"   // TODO: Update!
    },
};

const model_relations: ModelRelations = [
    { derivedEntityType: 'OI', nt1: 'orders', nt2: 'items' },
    { derivedEntityType: 'OP', nt1: 'orders', nt2: 'packages' },
    { derivedEntityType: 'IP', nt1: 'items', nt2: 'packages' }
];

const actToSpawnItems = "place order";

const fp = "./sample_logs/order-management.json";

const json = JSON.parse(fs.readFileSync(fp).toString());

const ekg: EventKnowledgeGraph = {
    activities: new Set(),
    entityTypes: new Set(),
    eventNodes: {},
    entityNodes: {},
    correlations: {},
    directlyFollows: {},
    entityRels: {},
    derivedDFs: {},
}

for (const objectType of json.objectTypes) {
    ekg.entityTypes.add(objectType.name);
}

for (const eventType of json.eventTypes) {
    ekg.activities.add(eventType.name);
}

ekg.activities.add("create item");

// Used for computing DF's
const invCorrelations: { [entityId: string]: Array<EventNode> } = {};

const entityByType: { [entityType: string]: Set<string> } = {};
for (const object of json.objects) {
    if (!include_entities.includes(object.type)) continue;
    const entityType = object.type;
    const objectId = object.id;

    if (!entityByType[entityType]) entityByType[entityType] = new Set();
    entityByType[object.type].add(objectId);
    invCorrelations[objectId] = [];
    if (!ekg.entityNodes[objectId]) ekg.entityNodes[objectId] = { entityId: objectId, entityType: object.type, rawId: objectId };
    if (!ekg.entityRels[objectId]) ekg.entityRels[objectId] = new Set();
    if (!ekg.directlyFollows[objectId]) ekg.directlyFollows[objectId] = [];
}

for (const object of json.objects) {
    if (!include_entities.includes(object.type)) continue;
    for (const otherObject of object.relationships) {
        const type = ekg.entityNodes[otherObject.objectId]?.entityType;
        if (!type || !include_entities.includes(type)) continue;
        ekg.entityRels[otherObject.objectId].add(object.id);
        ekg.entityRels[object.id].add(otherObject.objectId);
    }
}

const insertSpawnNode = (eventId: string, spawnedId: string, timestamp: Date) => {
    const id = `ci_${eventId}_${spawnedId}`;
    const eventNode = { eventId: id, activityName: "create item", spawnedId, timestamp: new Date(timestamp.getTime() - 1) }
    if (!ekg.eventNodes[id]) ekg.eventNodes[id] = eventNode;
    if (!ekg.correlations[id]) {
        ekg.correlations[id] = {}
        for (const entityType of include_entities) {
            ekg.correlations[id][entityType] = new Set();
        }
    }
    ekg.correlations[id]["orders"] = ekg.correlations[id]["orders"].union(ekg.correlations[eventId]["orders"]);
    for (const orderId of ekg.correlations[eventId]["orders"]) {
        invCorrelations[orderId].push(eventNode);
    }
}

for (const event of json.events) {
    const eventNode: EventNode = { eventId: event.id, activityName: event.type, spawnedId: "", timestamp: new Date(event.time) }
    if (!ekg.eventNodes[event.id]) ekg.eventNodes[event.id] = eventNode;
    if (!ekg.correlations[event.id]) {
        ekg.correlations[event.id] = {};
        for (const entityType of include_entities) {
            ekg.correlations[event.id][entityType] = new Set();
        }
    }
    for (const related of event.relationships) {
        const type = ekg.entityNodes[related.objectId]?.entityType;
        if (!type || !include_entities.includes(type)) continue;
        const entityId = related.objectId;
        const entityType = ekg.entityNodes[entityId].entityType;
        if (!items_activities.includes(eventNode.activityName) && entityType === "items") continue;
        invCorrelations[entityId].push(eventNode);
        ekg.correlations[event.id][entityType].add(entityId);
    }
    if (eventNode.activityName === actToSpawnItems) {
        event.relationships.forEach((related: any) => {
            if (related.qualifier === "item") {
                insertSpawnNode(event.id, related.objectId, new Date(event.time));
            }
        });
    }
}

for (const modelRelation of model_relations) {
    const { derivedEntityType, nt1, nt2 } = modelRelation;
    for (const n1 of entityByType[nt1]) {
        for (const n2 of ekg.entityRels[n1]) {
            if (ekg.entityNodes[n2].entityType !== nt2) continue;

            const entityId = n1 + "_" + n2;

            // Should do nothing, potentially remove
            if (ekg.entityNodes[entityId] !== undefined) throw new Error("Weird...");

            // Should do nothing, potentially remove
            if (n1 === n2) throw new Error("Weird also...");

            ekg.entityNodes[entityId] = { entityId, rawId: "", entityType: derivedEntityType };

            // All events that are correlated to n1 and/or n2 are correlated to the derived entity
            // Removing duplicates inline
            const allEvents = [...new Map([...invCorrelations[n1], ...invCorrelations[n2]].slice().reverse().map(v => [v.eventId, v])).values()].reverse();
            invCorrelations[entityId] = allEvents;
            for (const event of allEvents) {
                ekg.correlations[event.eventId][derivedEntityType].add(entityId);
            }
        }
    }
}

for (const entityId in invCorrelations) {
    if (isDerived(entityId, ekg.entityNodes, model_entities)) {
        ekg.derivedDFs[entityId] = invCorrelations[entityId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } else {
        ekg.directlyFollows[entityId] = invCorrelations[entityId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
}


const closures = findRelationClosures(ekg);

const cards = findTransitiveCardinalities(ekg, closures);

console.log(aggregateCorrelations(ekg));

const graph = discover(ekg, subprocess_entities, model_entities, model_entities_derived);

writeSerializedGraph(graph, "order-management-model");