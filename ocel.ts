import fs from "fs";
import { EntityRels, EventKnowledgeGraph, EventNode, isEntityRels } from "./types";
import { safeAdd } from "./src/utility";

const fp = "./sample_logs/ContainerLogistics.json";

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

console.log(Object.keys(json));

for (const objectType of json.objectTypes) {
    ekg.entityTypes.add(objectType.name);
}

for (const eventType of json.eventTypes) {
    ekg.activities.add(eventType.name);
}

for (const object of json.objects) {
    if (object.id === "vh30") console.log(object);
    if (!ekg.entityNodes[object.id]) ekg.entityNodes[object.id] = { entityId: object.id, entityType: object.type, rawId: "" };
    if (!ekg.entityRels[object.id]) ekg.entityRels[object.id] = new Set();
    if (!ekg.directlyFollows[object.id]) ekg.directlyFollows[object.id] = [];
    for (const otherObject of object.relationships) {
        if (!ekg.entityRels[otherObject.objectId]) ekg.entityRels[otherObject.objectId] = new Set();
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
        const entityId = related.objectId;
        console.log(ekg.entityNodes["vh30"]);
        console.log(related);
        const entityType = ekg.entityNodes[entityId].entityType;
        ekg.correlations[event.id][entityType].add(entityId);
    }
}

//console.log(ekg.correlations);