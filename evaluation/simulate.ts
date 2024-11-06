import evaluationGraph from "./evaluationGraph";
import getEngine from "./engine";
import { ModelEntities, OCEvent } from "../types";
import { copyOCDCRGraph, getRandomInt, getRandomItem } from "../src/utility";
import init from "../init";

import fs from "fs";

const noTraces = 1000;
const minLenght = 10;
const maxLength = 50;

const subprocess_entities = ['O', 'P'];

const model_entities: ModelEntities = {
    "Case": {
        dbDoc: undefined,
        idField: "",
    },
    "O": {
        dbDoc: undefined,
        idField: "",
        subprocessInitializer: "a",
    },
    "P": {
        dbDoc: undefined,
        idField: "",
        subprocessInitializer: "b",
    }
}

const engine = getEngine(model_entities);

init();

const objectIds: { [object: string]: number } = {
    "O": 0,
    "P": 0
}

const getSpawnId = (parts: Array<string>) => {
    if (parts[1]) return parts[1];
    for (const key of subprocess_entities) {
        if (model_entities[key].subprocessInitializer === parts[0]) {
            return key + "-" + objectIds[key]++;
        }
    }
    return "";
}
let caseId = 0;

let timestamp = 0;
const getTimeStamp = () => {
    return (new Date(timestamp += 1000));
}
let eventId = 0;
const getEventId = () => {
    return "Event" + eventId++;
}

let goodTraces = 0;
let csv = "EventID,timestamp,Case,Activity,lifecycle,O,P,EventOrigin\n";

const activityToEntityType: { [activity: string]: string } = {
    "a": "Case",
    "b": "Case",
    "c": "Case",
    "d": "Case",
    "e": "Case",
    "Oa": "O",
    "Ob": "O",
    "Oc": "O",
    "Od": "O",
    "Pa": "P",
    "Pb": "P",
    "Pc": "P",
    "Pd": "P",
}

while (goodTraces < noTraces) {
    let length = 0;
    const graph = copyOCDCRGraph(evaluationGraph);
    let csvBuffer = "";
    while (length < maxLength) {
        if (length > minLenght && engine.isAccepting(graph)) {
            caseId++;
            console.log(goodTraces++ + " | Good trace!");
            csv += csvBuffer;
            break;
        } else {
            const enabled = engine.getEnabled(graph);
            const event = getRandomItem(enabled);
            const parts = event.split("_");
            const entityId = getSpawnId(parts);
            const ocEvent: OCEvent<{ id: string }> = { activity: parts[0], attr: { id: entityId } }

            engine.execute(ocEvent, graph);

            const entityType = entityId.length > 0 ? entityId[0] : "Case";
            const csvEvent = `${getEventId()},${getTimeStamp()},${caseId},${parts[0]},,${entityType === "O" ? entityId : ""},${entityType === "P" ? entityId : ""},${activityToEntityType[parts[0]]}\n`;
            csvBuffer += csvEvent;
            length++;
        }
    }
}

fs.writeFileSync("./simulation.csv", csv);