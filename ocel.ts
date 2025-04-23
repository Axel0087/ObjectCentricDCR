import fs from "fs";
import { EntityRels, EventKnowledgeGraph, EventNode, isEntityRels, ModelEntities, ModelRelations } from "./types";
import { safeAdd } from "./src/utility";
import { aggregateCorrelations } from "./src/ocDiscovery";
import { findCardinalities } from "./src/processMining";

const include_entities = ['orders', 'items', 'packages', 'OI', 'OP', 'IP'];
const model_entities_derived = ['OI', 'OP', 'IP'];
const subprocess_entities = ['items', 'packages', 'orders'];

const model_entities: ModelEntities = {
    "orders": {
        dbDoc: {},
        idField: "",
        subprocessInitializer: ""   // TODO: Update!
    },
    "packages": {
        dbDoc: {},
        idField: "",
        subprocessInitializer: ""   // TODO: Update!
    },
    "items": {
        dbDoc: {},
        idField: "",
        subprocessInitializer: ""   // TODO: Update!
    },
};

const model_relations: ModelRelations = [
    { derivedEntityType: 'OI', nt1: 'orders', nt2: 'items' },
    { derivedEntityType: 'OP', nt1: 'orders', nt2: 'packages' },
    { derivedEntityType: 'IP', nt1: 'items', nt2: 'packages' }
];

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

for (const object of json.objects) {
    if (!include_entities.includes(object.type)) continue;
    if (!ekg.entityNodes[object.id]) ekg.entityNodes[object.id] = { entityId: object.id, entityType: object.type, rawId: "" };
    if (!ekg.entityRels[object.id]) ekg.entityRels[object.id] = new Set();
    if (!ekg.directlyFollows[object.id]) ekg.directlyFollows[object.id] = [];
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

for (const event of json.events) {
    const eventNode: EventNode = { eventId: event.id, activityName: event.type, spawnedId: "", timestamp: new Date(event.time) }
    if (!ekg.eventNodes[event.id]) ekg.eventNodes[event.id] = eventNode;
    if (!ekg.correlations[event.id]) ekg.correlations[event.id] = {}
    for (const entityType of ekg.entityTypes) {
        ekg.correlations[event.id][entityType] = new Set();
    }
    for (const related of event.relationships) {
        const type = ekg.entityNodes[related.objectId]?.entityType;
        if (!type || !include_entities.includes(type)) continue;
        const entityId = related.objectId;
        const entityType = ekg.entityNodes[entityId].entityType;
        ekg.correlations[event.id][entityType].add(entityId);
    }
}

const aggCorr = aggregateCorrelations(ekg);

const cards = findCardinalities(ekg, include_entities);

console.log(cards);