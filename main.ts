import init from "./init";
import { writeSerializedGraph } from "./src/fsInteraction";
import loadDB, { dbFind } from "./src/loadDB";
import { OCReplay, addOptimization } from "./src/objectCentric";
import { flipEventMap, timer } from "./src/utility";
import { Activity, ModelEntities, ModelRelations, OCEventLog, OCTrace, EventMap, DCRObject } from "./types";

import createEventKnowledgeGraph from "./src/ekg";

import { DisCoverOCDcrGraph, filterBasedOnAggregatedCorrelations, findConditionsResponses, findRelationClosures, getNonCoexistersAndNotSuccesion, initializeGetSubProcess, makeLogFromClosure, makeOCLogFromClosure, abstractLog, aggregateCorrelations } from "./src/ocDiscovery";
import ocAlign, { BitEngine, bitExecutePP, bitGetEnabled, bitIsAccepting, bitOCExecutePP, bitOCIsEnabled, ocDCRToBitDCR } from "./src/ocAlign";
import { BitOCDCRGraphPP } from "./types";


init();

const sample = false;
const align = false;

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

const csvPath = "path/to/BPI_Challenge_2017.csv";

const checkDBDoc = (dbDoc: any, row: any): boolean => {
    let retval = true;
    for (const key in dbDoc) {
        if (key === "$or") {
            retval = retval && (dbDoc[key] as Array<any>).reduce((acc, val) => acc || checkDBDoc(val, row), false);
        } else if (key === "$and") {
            retval = retval && (dbDoc[key] as Array<any>).reduce((acc, val) => acc && checkDBDoc(val, row), true);
        } else if (key === "$not") {
            retval = retval && !(checkDBDoc(dbDoc[key], row))
        } else {
            retval = retval && (dbDoc[key] === row[key]);
        }
    }
    return retval;
}


const isPartOfSubprocess = (row: any) => {
    for (const entity in model_entities) {
        if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer) return true;
        if (model_entities[entity].subprocessInitializer !== undefined && checkDBDoc(model_entities[entity].dbDoc, row)) return true;
    }
    return false;
}

const getEventId = (row: any): string => {
    for (const entity in model_entities) {
        if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer) return row[model_entities[entity].idField];
    }
    for (const entity in model_entities) {
        if (checkDBDoc(model_entities[entity].dbDoc, row)) return row[model_entities[entity].idField];
    }
    throw new Error("Mismatching row!");
}

const generateOCLog = async (db: Nedb<any>, rowToActivity: (row: any) => { activity: Activity, attr: { id: string } }): Promise<OCEventLog<{ id: string }>> => {
    console.log("Generating log");
    const rawTraces: { [traceId: string]: Array<{ event: { activity: string, attr: { id: string } }, timestamp: Date }> } = {};
    const log: OCEventLog<{ id: string }> = {
        activities: new Set(),
        traces: {}
    };
    for (const row of await dbFind(db, {})) {
        if (!rawTraces[row.case]) {
            rawTraces[row.case] = [];
        }
        const event = rowToActivity(row)
        log.activities.add(event.activity);
        rawTraces[row.case].push({ event, timestamp: new Date(row.timestamp) });
    }
    for (const traceId in rawTraces) {
        log.traces[traceId] = rawTraces[traceId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).map(en => en.event);
    }

    return log;
}

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

    const aggCorrInv = flipEventMap(aggregateCorrelations(graph));
    const subProcessEvents = new Set(subprocess_entities.flatMap((ent) => [model_entities[ent].subprocessInitializer as string, ...aggCorrInv[ent]]));

    console.log("Discovering Base Graph...");
    t = timer();

    const model = DisCoverOCDcrGraph(graph, model_entities_derived, model_entities);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Finding closures...");
    t = timer();

    const closures = findRelationClosures(graph);

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Making closure log...");
    t = timer();

    const interfaceLog = makeLogFromClosure(closures, graph);

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Finding interface exclusions...");
    t = timer();

    const interfaceAbs = abstractLog(interfaceLog);

    const aggregatedCorrelations = aggregateCorrelations(graph);

    const interfaceAtMostOnce = filterBasedOnAggregatedCorrelations(interfaceAbs.atMostOnce, subprocess_entities, aggregatedCorrelations);

    const { getSubProcessGraph, getSubProcess } = initializeGetSubProcess(aggregatedCorrelations, model_entities);

    for (const activity of interfaceAtMostOnce) {
        if (getSubProcess(activity) === "") continue;
        const subProcessGraph = getSubProcessGraph(model, activity);
        const interfaceEvent = subProcessGraph.eventToInterface[activity];
        subProcessGraph.excludesTo[interfaceEvent].add(interfaceEvent);
    }

    const { nonCoExisters, precedesButNeverSucceeds } = getNonCoexistersAndNotSuccesion(interfaceAbs, subprocess_entities, aggregatedCorrelations);

    for (const event in precedesButNeverSucceeds) {
        if (getSubProcess(event) === "") continue;
        const subProcessGraph = getSubProcessGraph(model, event);
        const interfaceEvent = subProcessGraph.eventToInterface[event];
        for (const s of precedesButNeverSucceeds[event]) {
            if (!interfaceAtMostOnce.has(s)) {
                subProcessGraph.excludesTo[interfaceEvent].add(getSubProcessGraph(model, s).eventToInterface[s]);
            }
        }
    }

    const addInterFaceConstraints = (rel: EventMap, key: string) => {
        for (const activity in rel) {
            if (getSubProcess(activity) === "") continue;
            const subProcessGraph = getSubProcessGraph(model, activity);
            const interfaceEvent = subProcessGraph.eventToInterface[activity];
            const setToUnion = new Set([...rel[activity]].map(otherActivity => subProcessGraph.eventToInterface[otherActivity]));
            (subProcessGraph[key as keyof DCRObject] as EventMap)[interfaceEvent].union(setToUnion);
        }
    }

    addInterFaceConstraints(nonCoExisters, "excludesTo");

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    const interFaceOCLog = makeOCLogFromClosure(closures, graph, model_entities, subprocess_entities);

    console.log("Finding interface conditions / responses...");
    t = timer();

    const { conditions, responses } = findConditionsResponses(interFaceOCLog, model_entities);

    addInterFaceConstraints(conditions, "conditionsFor");
    addInterFaceConstraints(responses, "responseTo");

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Writing model...");
    writeSerializedGraph(model, "FullModel");

    const logWithSubprocess: OCEventLog<{ id: string }> = await generateOCLog(db, (row) => ({ activity: row.Activity + ":" + row.lifecycle, attr: { id: (isPartOfSubprocess(row) ? getEventId(row) : "") } }));

    console.log(`
        Accepting traces (flattened by case): ${OCReplay(logWithSubprocess, model, model_entities)} / ${Object.keys(logWithSubprocess.traces).length}
    `);
    console.log(`
        Accepting traces (closure log): ${OCReplay(interFaceOCLog, model, model_entities)} / ${Object.keys(interFaceOCLog.traces).length}
    `);

    let count = 0;
    if (align) {
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

            console.log("Aligning noisy trace...")
            console.log("DONE! Cost: " + ocAlign(noisyTrace, bitModelPP, engine, spawnIds, model_entities).cost)
            console.log("Took " + t.stop() / 1000 + " seconds");
            if (++count === 10) break;
        }
    }
}

main();