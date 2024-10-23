import init from "./init";
import { writeSerializedGraph } from "./src/fsInteraction";
import loadDB, { dbFind, generateOCLog, getEventId, isPartOfSubprocess } from "./src/loadDB";
import { OCReplay, addOptimization } from "./src/objectCentric";
import { OCDCRSize, avg, copyEventMap, flipEventMap, timer } from "./src/utility";
import { Activity, ModelEntities, ModelRelations, OCEventLog, OCTrace, EventMap, DCRObject } from "./types";

import createEventKnowledgeGraph from "./src/ekg";

import { DisCoverOCDcrGraph, filterBasedOnAggregatedCorrelations, findConditionsResponses, findRelationClosures, getNonCoexistersAndNotSuccesion, initializeGetSubProcess, makeLogFromClosure, makeOCLogFromClosure, abstractLog, aggregateCorrelations, discover } from "./src/ocDiscovery";
import ocAlign, { BitEngine, alignCost, bitExecutePP, bitGetEnabled, bitIsAccepting, bitOCExecutePP, bitOCIsEnabled, ocDCRToBitDCR } from "./src/ocAlign";
import { BitOCDCRGraphPP } from "./types";

import fs from "fs";

init();

const sample = false;

// Align params
const align = true;
const totalTimeOutHours = 4;
const timeOutMinutes = 5;

const rowFilter = (row: any) => {
    return (row.lifecycle === "SUSPEND" || row.lifecycle === "RESUME");
};

const sampleIds = sample ? ['Application_2045572635',
    'Application_2014483796',
    'Application_1973871032',
    'Application_1389621581',
    'Application_1564472847',
    'Application_430577010',
    'Application_889180637',
    'Application_1065734594',
    'Application_681547497',
    'Application_1020381296',
    'Application_180427873',
    'Application_2103964126',
    'Application_55972649',
    'Application_1076724533',
    'Application_1639247005',
    'Application_1465025013',
    'Application_1244956957',
    'Application_1974117177',
    'Application_797323371',
    'Application_1631297810'] : [];

const include_entities = ['Application', 'Workflow', 'Offer', 'Case_AO', 'Case_AW', 'Case_WO'];
const model_entities_derived = ['Case_AO', 'Case_AW', 'Case_WO'];
const subprocess_entities = ['Offer'];

const model_entities: ModelEntities = {
    'Application': { idField: 'case', dbDoc: { EventOrigin: "Application" } },
    'Workflow': {
        idField: 'case', dbDoc: {
            $or: [{ EventOrigin: "Workflow" },
            { Activity: "O_Create Offer" }]
        }
    },
    'Offer': {
        idField: 'OfferID', dbDoc:
        {
            $and: [{ EventOrigin: "Offer" },
            { $not: { Activity: "O_Create Offer" } }]
        },
        subprocessInitializer: "O_Create Offer:COMPLETE"
    },
};

const model_relations: ModelRelations = [
    { derivedEntityType: 'Case_AO', nt1: 'Application', nt2: 'Offer' },
    { derivedEntityType: 'Case_AW', nt1: 'Application', nt2: 'Workflow' },
    { derivedEntityType: 'Case_WO', nt1: 'Workflow', nt2: 'Offer' }
];

const csvPath = "./BPI_Challenge_2017.csv";


const getRandomInt = (min: number, max: number): number => {
    const minCeiled = Math.ceil(min);
    const maxFloored = Math.floor(max);
    return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

const getRandomItem = <T>(set: Set<T>) => {
    let items = Array.from(set);
    return items[Math.floor(Math.random() * items.length)];
}

const noisify = (trace: OCTrace<{ id: string }>, noisePercentage: number, activities: Set<Activity>, subProcessActivities: Set<Activity>): OCTrace<{ id: string }> => {
    const retTrace: OCTrace<{ id: string }> = [];
    const ids = trace.map(event => event.attr.id).filter(id => id !== "");

    for (let i = 0; i < trace.length; i++) {
        if (Math.random() <= noisePercentage) {
            const choice = getRandomInt(0, 3);
            switch (choice) {
                // Insert
                case 0:
                    retTrace.push(trace[i]);
                    const activity = getRandomItem(activities);
                    retTrace.push({ activity, attr: { id: subProcessActivities.has(activity) ? getRandomItem(new Set(ids)) : "" } });
                    break;
                // Delete
                case 1:
                    break;
                // Swap
                case 2:
                    const elem = retTrace.pop();
                    retTrace.push(trace[i]);
                    if (elem !== undefined) {
                        retTrace.push(elem);
                    }
                    break;
                default: throw new Error("Wrong integer mate " + choice);
            }
        } else {
            retTrace.push(trace[i]);
        }
    }
    return retTrace;
}

const main = async () => {

    console.log("Loading db...");
    let t = timer();
    const db = await loadDB(csvPath, sampleIds, rowFilter);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    const graph = await createEventKnowledgeGraph(db, include_entities, model_entities, model_relations);

    const model = discover(graph, subprocess_entities, model_entities, model_entities_derived);

    console.log("Writing model...");
    writeSerializedGraph(model, "FullModel");

    const logWithSubprocess: OCEventLog<{ id: string }> = await generateOCLog(db, (row) => ({
        activity: row.Activity + ":" + row.lifecycle,
        attr: { id: (isPartOfSubprocess(row, model_entities) ? getEventId(row, model_entities) : "") }
    }));
    const closures = findRelationClosures(graph);
    const interFaceOCLog = makeOCLogFromClosure(closures, graph, model_entities, subprocess_entities);

    console.log(`
        Accepting traces (flattened by case): ${OCReplay(logWithSubprocess, model, model_entities)} / ${Object.keys(logWithSubprocess.traces).length}
    `);
    console.log(`
        Accepting traces (closure log): ${OCReplay(interFaceOCLog, model, model_entities)} / ${Object.keys(interFaceOCLog.traces).length}
    `);

    const { activities, relations } = OCDCRSize(model);
    console.log(`
        Full model size:
        ${activities} activities
        ${relations} constraints
    `)

    const timeout = 1000 * 60 * timeOutMinutes;
    const totalTimeout = 1000 * 60 * 60 * totalTimeOutHours;
    const tStart = Date.now();
    let count = 0;
    const totalTraces = Object.keys(logWithSubprocess.traces).length;
    if (align) {
        let timeoutCount = 0;
        const timings = [];

        const aggCorr = aggregateCorrelations(graph);
        const aggCorrInv = flipEventMap(aggCorr);
        const subProcessEvents = new Set(subprocess_entities.flatMap((ent) => [model_entities[ent].subprocessInitializer as string, ...aggCorrInv[ent]]));
        for (const traceId in logWithSubprocess.traces) {
            const trace = logWithSubprocess.traces[traceId];

            const noisyTrace = noisify(trace, 0.1, logWithSubprocess.activities, subProcessEvents);

            const spawnIds = noisyTrace.map(event => event.attr.id).filter(id => id !== "");
            const t = timer();

            const modelPP = addOptimization(model, spawnIds);

            const bitModelPP = ocDCRToBitDCR(modelPP, spawnIds);

            const engine: BitEngine<BitOCDCRGraphPP> = {
                execute: (event, graph) => bitOCExecutePP(event, graph, model_entities),
                getEnabled: bitGetEnabled,
                isEnabled: (event, graph) => bitOCIsEnabled(event, graph, model_entities),
                isAccepting: bitIsAccepting,
                executeStr: bitExecutePP,
            }

            const aggCorrFilt = copyEventMap(aggCorr);
            for (const key in aggCorrFilt) {
                aggCorrFilt[key].difference(new Set(model_entities_derived));
            }

            console.log(`Aligning noisy trace... (${++count}/${totalTraces})`);
            const alignment = await ocAlign(noisyTrace, bitModelPP, engine, model_entities, aggCorrFilt, Infinity, Infinity, alignCost, timeout);
            if (alignment === "TIMEOUT") {
                timeoutCount++;
                fs.writeFileSync("badAlignTraces/" + traceId + ".json", JSON.stringify(noisyTrace));
                console.log("DONE! TIMEOUT...");
            } else {
                const timing = t.stop() / 1000;
                console.log("DONE! Cost: " + alignment.cost)
                console.log("Took " + timing + " seconds");
                timings.push(timing);
            }
            console.log("");
            console.log(`Timeouts: ${timeoutCount}/${count} - ${timeoutCount / count}`);
            console.log("Avg non-timeout time (s): " + avg(timings) + "\n");
            if (Date.now() - tStart > totalTimeout) {
                console.log(`This has taken ${totalTimeOutHours} hours... I'm out...\n`);
                break;
            }
        }

    }
}

main();