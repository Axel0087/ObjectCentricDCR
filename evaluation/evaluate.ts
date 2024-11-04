import evaluationGraph from "./evaluationGraph";
import getEngine from "./engine";
import { ModelEntities, OCEvent } from "../types";
import { copyOCDCRGraph, getRandomInt, getRandomItem } from "../src/utility";
import init from "../init";

const noTraces = 1000;
const minLenght = 10;
const maxLength = 50;

const model_entities_derived = ['Case_O', 'Case_P', 'O_P'];
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

const getSpawnId = (activity: string) => {
    for (const key of subprocess_entities) {
        if (model_entities[key].subprocessInitializer === activity) {
            return key + "-" + objectIds[key]++;
        }
    }
    return "";
}

let goodTraces = 0;
while (goodTraces < noTraces) {
    let length = 0;
    const graph = copyOCDCRGraph(evaluationGraph);
    while (length < maxLength) {
        if (length > minLenght && engine.isAccepting(graph)) {
            console.log("Good trace!");
            console.log(goodTraces++);
            break;
        } else {
            const enabled = engine.getEnabled(graph);
            const activity = getRandomItem(enabled);
            const parts = activity.split("_");
            const ocEvent: OCEvent<{id: string}> = { activity: parts[0], attr: { id: parts.length > 1 ? parts[1] : getSpawnId(parts[0])} }
            console.log(ocEvent);
            engine.execute(ocEvent, graph);
            length++;
        }
    }
    if (length == maxLength) {
        console.log("Bad trace.....");
    }
}