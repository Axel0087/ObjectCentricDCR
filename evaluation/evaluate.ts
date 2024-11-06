import { writeSerializedGraph } from "../src/fsInteraction";
import loadDB from "../src/loadDB";
import { discover } from "../src/ocDiscovery";
import { printFull, timer } from "../src/utility";
import { ModelEntities, ModelRelations } from "../types";

import createEventKnowledgeGraph from "../src/ekg";
import init from "../init";

const csvPath = "./simulation.csv";

const model_entities_derived = ['Case_O', 'Case_P', 'O_P'];
const subprocess_entities = ['O', 'P'];
const include_entities = ['Case', 'O', 'P', 'Case_O', 'Case_P', 'O_P'];

const model_relations: ModelRelations = [
    { derivedEntityType: 'Case_O', nt1: 'Case', nt2: 'O' },
    { derivedEntityType: 'Case_P', nt1: 'Case', nt2: 'P' },
    { derivedEntityType: 'O_P', nt1: 'O', nt2: 'P' }
];

const model_entities: ModelEntities = {
    "Case": {
        dbDoc: { EventOrigin: "Case" },
        idField: "Case",
    },
    "O": {
        dbDoc: { EventOrigin: "O" },
        idField: "O",
        subprocessInitializer: "a",
    },
    "P": {
        dbDoc: { EventOrigin: "P" },
        idField: "P",
        subprocessInitializer: "b",
    }
}

init();

const main = async () => {

    console.log("Loading db...");
    let t = timer();
    const db = await loadDB(csvPath);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    const graph = await createEventKnowledgeGraph(db, include_entities, model_entities, model_relations);

    const model = discover(graph, subprocess_entities, model_entities, model_entities_derived);

    console.log("Writing model...");
    writeSerializedGraph(model, "simulatedModel");
}

main();