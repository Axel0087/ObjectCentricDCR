"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findConditionsResponses = exports.getNonCoexistersAndNotSuccesion = exports.filterBasedOnAggregatedCorrelations = exports.makeOCLogFromClosure = exports.makeLogFromClosure = exports.findRelationClosures = exports.DisCoverOCDcrGraph = exports.mineOCDCR = exports.abstractLog = exports.aggregateCorrelations = exports.logsForDerivedEntityTypes = exports.abstractionUnion = exports.initializeGetSubProcess = void 0;
const utility_1 = require("./utility");
const eventToInterface = (event) => "I_" + event + "_I";
// Removes redundant relations based on transitive closure
const optimizeRelation = (relation) => {
    for (const eventA in relation) {
        for (const eventB of relation[eventA]) {
            relation[eventA].difference(relation[eventB]);
        }
    }
};
const initializeGetSubProcess = (aggCorr, model_entities) => {
    const getSubProcess = (...events) => {
        const isSubProcess = (entity) => (entity in model_entities) &&
            model_entities[entity].subprocessInitializer !== undefined;
        for (const event of events) {
            for (const entity of aggCorr[event]) {
                if (isSubProcess(entity))
                    return entity;
            }
        }
        return "";
    };
    const getSubProcessGraph = (graph, ...events) => {
        const subProcess = getSubProcess(...events);
        if (subProcess === "") {
            return graph;
        }
        else {
            return graph.spawns[model_entities[subProcess].subprocessInitializer];
        }
    };
    return {
        getSubProcess,
        getSubProcessGraph
    };
};
exports.initializeGetSubProcess = initializeGetSubProcess;
const abstractionUnion = (abs1, abs2) => {
    const unionEventMap = (em1, em2) => {
        const unionedEventMap = {};
        const keySet = new Set([...Object.keys(em1), ...Object.keys(em2)]);
        for (const key of keySet) {
            if (em1[key] !== undefined) {
                if (em2[key] !== undefined) {
                    unionedEventMap[key] = (0, utility_1.copySet)(em1[key]).union(em2[key]);
                }
                else {
                    unionedEventMap[key] = (0, utility_1.copySet)(em1[key]);
                }
            }
            else {
                unionedEventMap[key] = (0, utility_1.copySet)(em2[key]);
            }
        }
        return unionedEventMap;
    };
    const unionedAbstraction = {
        events: (0, utility_1.copySet)(abs1.events).union(abs2.events),
        traces: { ...abs1.traces, ...abs2.traces },
        atMostOnce: (0, utility_1.copySet)(abs1.atMostOnce).union(abs2.atMostOnce),
        chainPrecedenceFor: unionEventMap(abs1.chainPrecedenceFor, abs2.chainPrecedenceFor),
        precedenceFor: unionEventMap(abs1.precedenceFor, abs2.precedenceFor),
        predecessor: unionEventMap(abs1.predecessor, abs2.predecessor),
        successor: unionEventMap(abs1.successor, abs2.successor),
        responseTo: unionEventMap(abs1.responseTo, abs2.responseTo)
    };
    return unionedAbstraction;
};
exports.abstractionUnion = abstractionUnion;
const logsForDerivedEntityTypes = (ekg, derivedEntityTypes) => {
    const retval = {};
    for (const entityType of derivedEntityTypes) {
        retval[entityType] = {
            events: new Set(),
            traces: {}
        };
    }
    const getEntityType = (entityId) => {
        return ekg.entityNodes[entityId].entityType;
    };
    for (const entityId in ekg.derivedDFs) {
        const log = retval[getEntityType(entityId)];
        const trace = ekg.derivedDFs[entityId].map(eventNode => eventNode.activityName);
        log.traces[entityId] = trace;
        for (const activity of trace) {
            log.events.add(activity);
        }
    }
    return retval;
};
exports.logsForDerivedEntityTypes = logsForDerivedEntityTypes;
const aggregateCorrelations = (ekg) => {
    const aggCorr = {};
    const getActivity = (eventId) => {
        return ekg.eventNodes[eventId].activityName;
    };
    for (const activity of ekg.activities) {
        aggCorr[activity] = new Set();
    }
    for (const eventId in ekg.correlations) {
        for (const entityType in ekg.correlations[eventId]) {
            if (ekg.correlations[eventId][entityType].size !== 0) {
                //console.log(getActivity(eventId));
                aggCorr[getActivity(eventId)].add(entityType);
            }
        }
    }
    return aggCorr;
};
exports.aggregateCorrelations = aggregateCorrelations;
// Create abstraction of an EventLog in order to make fewer passes when mining constraints
const abstractLog = (log) => {
    const logAbstraction = {
        events: (0, utility_1.copySet)(log.events),
        traces: { ...log.traces },
        // At first we assume all events will be seen at least once
        // Once we see them twice in a trace, they are removed from atMostOnce
        atMostOnce: (0, utility_1.copySet)(log.events),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {},
    };
    // Initialize all EventMaps in the Log Abstraction.
    // Predecessor and successor sets start empty,
    // while the rest are initialized to be all events besides itself
    for (const event of log.events) {
        logAbstraction.chainPrecedenceFor[event] = (0, utility_1.copySet)(log.events);
        logAbstraction.chainPrecedenceFor[event].delete(event);
        logAbstraction.precedenceFor[event] = (0, utility_1.copySet)(log.events);
        logAbstraction.precedenceFor[event].delete(event);
        logAbstraction.responseTo[event] = (0, utility_1.copySet)(log.events);
        logAbstraction.responseTo[event].delete(event);
        logAbstraction.predecessor[event] = new Set();
        logAbstraction.successor[event] = new Set();
    }
    const parseTrace = (trace) => {
        const localAtLeastOnce = new Set();
        const localSeenOnlyBefore = {};
        let lastEvent = "";
        for (const event of trace) {
            // All events seen before this one must be predecessors
            logAbstraction.predecessor[event].union(localAtLeastOnce);
            // If event seen before in trace, remove from atMostOnce
            if (localAtLeastOnce.has(event)) {
                logAbstraction.atMostOnce.delete(event);
            }
            localAtLeastOnce.add(event);
            // Precedence for (event): All events that occured
            // before (event) are kept in the precedenceFor set
            logAbstraction.precedenceFor[event].intersect(localAtLeastOnce);
            // Chain-Precedence for (event): Some event must occur
            // immediately before (event) in all traces
            if (lastEvent !== "") {
                // If first time this clause is encountered - leaves lastEvent in chain-precedence set.
                // The intersect is empty if this clause is encountered again with another lastEvent.
                logAbstraction.chainPrecedenceFor[event].intersect(new Set([lastEvent]));
            }
            else {
                // First event in a trace, and chainPrecedence is therefore not possible
                logAbstraction.chainPrecedenceFor[event] = new Set();
            }
            // To later compute responses we note which events were seen
            // before (event) and not after
            if (logAbstraction.responseTo[event].size > 0) {
                // Save all events seen before (event)
                localSeenOnlyBefore[event] = (0, utility_1.copySet)(localAtLeastOnce);
            }
            // Clear (event) from all localSeenOnlyBefore, since (event) has now occured after
            for (const key in localSeenOnlyBefore) {
                localSeenOnlyBefore[key].delete(event);
            }
            lastEvent = event;
        }
        for (const event in localSeenOnlyBefore) {
            // Compute set of events in trace that happened after (event)
            const seenOnlyAfter = new Set(localAtLeastOnce).difference(localSeenOnlyBefore[event]);
            // Delete self-relation
            seenOnlyAfter.delete(event);
            // Set of events that always happens after (event)
            logAbstraction.responseTo[event].intersect(seenOnlyAfter);
        }
    };
    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        parseTrace(trace);
    }
    // Compute successor set based on duality with predecessor set
    for (const i in logAbstraction.predecessor) {
        for (const j of logAbstraction.predecessor[i]) {
            logAbstraction.successor[j].add(i);
        }
    }
    return logAbstraction;
};
exports.abstractLog = abstractLog;
const mineOCDCR = (logAbstraction, ekg, model_entities, findAdditionalConditions = true) => {
    const aggCorr = (0, exports.aggregateCorrelations)(ekg);
    const { getSubProcess, getSubProcessGraph } = (0, exports.initializeGetSubProcess)(aggCorr, model_entities);
    const mainEvents = new Set([...logAbstraction.events].filter((e) => getSubProcess(e) === ""));
    // Initialize graph
    let graph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: mainEvents,
        eventInterfaces: new Set(),
        eventToInterface: {},
        interfaceToEvent: {},
        interfaceMap: {},
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set(),
            pending: new Set(),
            included: (0, utility_1.copySet)(mainEvents),
        },
        spawns: {}
    };
    for (const entity in model_entities) {
        const spawnEvent = model_entities[entity].subprocessInitializer;
        if (spawnEvent !== undefined) {
            const subProcessEvents = new Set([...logAbstraction.events].filter((e) => getSubProcess(e) === entity));
            graph.spawns[spawnEvent] = {
                events: subProcessEvents,
                eventInterfaces: new Set([...subProcessEvents].map(eventToInterface)),
                eventToInterface: [...subProcessEvents].map(event => ({ [event]: eventToInterface(event) })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
                interfaceToEvent: [...subProcessEvents].map(event => ({ [eventToInterface(event)]: event })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
                conditionsFor: {},
                excludesTo: {},
                includesTo: {},
                milestonesFor: {},
                responseTo: {},
                marking: {
                    executed: new Set(),
                    pending: new Set(),
                    included: (0, utility_1.copySet)(subProcessEvents),
                },
                spawns: {},
            };
            // Initialize all mappings to avoid indexing errors
            for (const event of logAbstraction.events) {
                graph.spawns[spawnEvent].conditionsFor[event] = new Set();
                graph.spawns[spawnEvent].excludesTo[event] = new Set();
                graph.spawns[spawnEvent].includesTo[event] = new Set();
                graph.spawns[spawnEvent].responseTo[event] = new Set();
                graph.spawns[spawnEvent].milestonesFor[event] = new Set();
                if (getSubProcess(event) !== "") {
                    graph.spawns[spawnEvent].conditionsFor[eventToInterface(event)] = new Set();
                    graph.spawns[spawnEvent].excludesTo[eventToInterface(event)] = new Set();
                    graph.spawns[spawnEvent].includesTo[eventToInterface(event)] = new Set();
                    graph.spawns[spawnEvent].responseTo[eventToInterface(event)] = new Set();
                    graph.spawns[spawnEvent].milestonesFor[eventToInterface(event)] = new Set();
                }
            }
        }
    }
    // Initialize all mappings to avoid indexing errors
    for (const event of mainEvents) {
        graph.conditionsFor[event] = new Set();
        graph.excludesTo[event] = new Set();
        graph.includesTo[event] = new Set();
        graph.responseTo[event] = new Set();
        graph.milestonesFor[event] = new Set();
    }
    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        getSubProcessGraph(graph, event).excludesTo[event].add(event);
    }
    // Mine responses from logAbstraction
    for (const e in logAbstraction.responseTo) {
        for (const j of logAbstraction.responseTo[e]) {
            getSubProcessGraph(graph, e, j).responseTo[e].add(j);
        }
    }
    // Mine conditions from logAbstraction
    for (const e in logAbstraction.precedenceFor) {
        for (const j of logAbstraction.precedenceFor[e]) {
            getSubProcessGraph(graph, e, j).conditionsFor[e].add(j);
        }
    }
    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            if (!logAbstraction.atMostOnce.has(j)) {
                getSubProcessGraph(graph, i, j).includesTo[i].add(j);
            }
            getSubProcessGraph(graph, j).excludesTo[j].add(j);
        }
    }
    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(logAbstraction.predecessor[event]).union(logAbstraction.successor[event]);
        const nonCoExisters = new Set(logAbstraction.events).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        for (const nonCoExister of nonCoExisters) {
            getSubProcessGraph(graph, event, nonCoExister).excludesTo[event].add(nonCoExister);
        }
        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = (0, utility_1.copySet)(logAbstraction.predecessor[event]).difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            if (!getSubProcessGraph(graph, s).excludesTo[s].has(s)) {
                getSubProcessGraph(graph, s, event).excludesTo[event].add(s);
            }
        }
    }
    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of getSubProcessGraph(graph, s, r).excludesTo[r]) {
                getSubProcessGraph(graph, s, t).excludesTo[s].delete(t);
            }
        }
    }
    // remove redundant conditions
    optimizeRelation(graph.conditionsFor);
    // Remove redundant responses
    optimizeRelation(graph.responseTo);
    for (const spawnEvent in graph.spawns) {
        optimizeRelation(graph.spawns[spawnEvent].conditionsFor);
        optimizeRelation(graph.spawns[spawnEvent].responseTo);
    }
    if (findAdditionalConditions) {
        // Mining additional conditions:
        // Every event, x, that occurs before some event, y, is a possible candidate for a condition x -->* y
        // This is due to the fact, that in the traces where x does not occur before y, x might be excluded
        const possibleConditions = (0, utility_1.copyEventMap)(logAbstraction.predecessor);
        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = new Set();
            const included = (0, utility_1.copySet)(logAbstraction.events);
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = (0, utility_1.copySet)(logAbstraction.events).difference(included);
                const validConditions = (0, utility_1.copySet)(localSeenBefore).union(excluded);
                // Only keep valid conditions
                possibleConditions[event].intersect(validConditions);
                // Execute excludes starting from (event)
                included.difference(getSubProcessGraph(graph, event).excludesTo[event]);
                // Execute includes starting from (event)
                included.union(getSubProcessGraph(graph, event).includesTo[event]);
            }
        }
        // Now the only possibleCondtitions that remain are valid for all traces
        // These are therefore added to the graph
        for (const e in possibleConditions) {
            for (const j of possibleConditions[e]) {
                getSubProcessGraph(graph, e, j).conditionsFor[e].add(j);
            }
        }
        // Removing redundant conditions
        optimizeRelation(graph.conditionsFor);
        for (const spawnEvent in graph.spawns) {
            optimizeRelation(graph.spawns[spawnEvent].conditionsFor);
        }
    }
    return graph;
};
exports.mineOCDCR = mineOCDCR;
const filterBasedOnEkg = (graph, aggCorr, derivedEntityTypes, onlyDerived = false) => {
    const derivedEntitySet = new Set(derivedEntityTypes);
    const shareEntityType = (e1, e2) => {
        const intersection = (0, utility_1.copySet)(aggCorr[e1]).intersect(aggCorr[e2]);
        if (onlyDerived)
            return intersection.size > 0 && (intersection.difference(derivedEntitySet).size === 0);
        else
            return intersection.size > 0;
    };
    const filterRelation = (rel) => {
        for (const e1 in rel) {
            for (const e2 of rel[e1]) {
                if (!shareEntityType(e1, e2)) {
                    rel[e1].delete(e2);
                }
                ;
            }
        }
    };
    const filterGraph = (model) => {
        filterRelation(model.conditionsFor);
        filterRelation(model.responseTo);
        filterRelation(model.excludesTo);
        filterRelation(model.includesTo);
        filterRelation(model.milestonesFor);
    };
    filterGraph(graph);
    for (const spawnId in graph.spawns) {
        filterGraph(graph.spawns[spawnId]);
    }
    return graph;
};
const DisCoverOCDcrGraph = (ekg, derivedEntityTypes, model_entities, onlyDerived = false) => {
    const logs = (0, exports.logsForDerivedEntityTypes)(ekg, derivedEntityTypes);
    const emptyAbstraction = {
        events: new Set(),
        traces: {},
        atMostOnce: new Set(),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {}
    };
    const bigAbs = Object.keys(logs).reduce((accAbs, et) => {
        const abs = (0, exports.abstractLog)(logs[et]);
        return (0, exports.abstractionUnion)(accAbs, abs);
    }, emptyAbstraction);
    return filterBasedOnEkg((0, exports.mineOCDCR)(bigAbs, ekg, model_entities, true), (0, exports.aggregateCorrelations)(ekg), derivedEntityTypes, onlyDerived);
};
exports.DisCoverOCDcrGraph = DisCoverOCDcrGraph;
const findRelationClosures = (ekg) => {
    let entities = new Set(Object.keys(ekg.entityNodes));
    const findClosure = (entity) => {
        if (!entities.has(entity))
            return new Set();
        entities.delete(entity);
        const closure = new Set([entity]);
        for (const relatedEntity of ekg.entityRels[entity]) {
            closure.union(findClosure(relatedEntity));
        }
        return closure;
    };
    let retArr = [];
    while (entities.size !== 0) {
        const entity = entities.values().next().value;
        if (!ekg.entityRels[entity]) {
            entities.delete(entity);
            continue;
        }
        retArr.push(findClosure(entity));
    }
    return retArr;
};
exports.findRelationClosures = findRelationClosures;
const makeLogFromClosure = (closures, ekg) => {
    let id = 0;
    const log = {
        events: new Set(),
        traces: {}
    };
    for (const closure of closures) {
        let trace = [];
        for (const entity of closure) {
            trace = trace.concat(ekg.directlyFollows[entity]);
        }
        log.events.union(new Set(trace.map(e => e.activityName)));
        log.traces[id++] = trace.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).map(e => e.activityName);
    }
    return log;
};
exports.makeLogFromClosure = makeLogFromClosure;
const makeOCLogFromClosure = (closures, ekg, model_entities, subprocessEntities) => {
    let id = 0;
    const log = {
        activities: new Set(),
        traces: {}
    };
    const initializers = new Set(Object.keys(model_entities).map(key => model_entities[key].subprocessInitializer).filter(event => event !== undefined));
    for (const closure of closures) {
        let trace = [];
        for (const entity of closure) {
            const isSubProcess = subprocessEntities.includes(ekg.entityNodes[entity].entityType);
            trace = trace.concat(ekg.directlyFollows[entity].map(event => ({
                activity: event.activityName,
                attr: {
                    id: isSubProcess ? ekg.entityNodes[entity].rawId : initializers.has(event.activityName) ? event.spawnedId : "",
                    timestamp: event.timestamp
                }
            })));
        }
        log.activities.union(new Set(trace.map(e => e.activity)));
        log.traces[id++] = trace.sort((a, b) => a.attr.timestamp.getTime() - b.attr.timestamp.getTime());
    }
    return log;
};
exports.makeOCLogFromClosure = makeOCLogFromClosure;
const filterBasedOnAggregatedCorrelations = (activities, subprocessEntities, aggCorr) => {
    return new Set([...activities].filter(event => (new Set(subprocessEntities)).intersect(aggCorr[event]).size !== 0));
};
exports.filterBasedOnAggregatedCorrelations = filterBasedOnAggregatedCorrelations;
const getNonCoexistersAndNotSuccesion = (abs, subprocessEntities, aggCorr) => {
    const retval = {
        nonCoExisters: {},
        precedesButNeverSucceeds: {}
    };
    // Additional excludes based on predecessors / successors
    for (const event of abs.events) {
        if ((new Set(subprocessEntities)).intersect(aggCorr[event]).size === 0)
            continue;
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(abs.predecessor[event]).union(abs.successor[event]);
        const nonCoExisters = (0, exports.filterBasedOnAggregatedCorrelations)(abs.events, subprocessEntities, aggCorr).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        retval.nonCoExisters[event] = nonCoExisters;
        retval.precedesButNeverSucceeds[event] = (0, exports.filterBasedOnAggregatedCorrelations)(abs.predecessor[event], subprocessEntities, aggCorr).difference(abs.successor[event]);
    }
    return retval;
};
exports.getNonCoexistersAndNotSuccesion = getNonCoexistersAndNotSuccesion;
const findConditionsResponses = (log, model_entities) => {
    const initializers = new Set(Object.keys(model_entities).map(key => model_entities[key].subprocessInitializer).filter(event => event !== undefined));
    const subProcessTraces = Object.keys(log.traces).map(traceId => ({ [traceId]: log.traces[traceId].filter(event => event.attr.id !== "") })).reduce((acc, cum) => ({ ...acc, ...cum }));
    const subProcessActivities = new Set(Object.keys(subProcessTraces).flatMap(traceId => subProcessTraces[traceId].map(event => event.activity))).difference(initializers);
    const retval = {
        conditions: {},
        responses: {}
    };
    for (const activity of subProcessActivities) {
        retval.conditions[activity] = (0, utility_1.copySet)(subProcessActivities);
        retval.conditions[activity].delete(activity);
        retval.responses[activity] = (0, utility_1.copySet)(subProcessActivities);
        retval.responses[activity].delete(activity);
    }
    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        const subProcessTrace = trace.filter(event => event.attr.id !== "");
        const spawned = new Set();
        const localAtLeastOnce = {};
        const responsesToSatisfy = {};
        for (const event of subProcessTrace) {
            localAtLeastOnce[event.activity] = new Set();
            responsesToSatisfy[event.activity] = {};
            for (const otherEvent of subProcessTrace) {
                responsesToSatisfy[event.activity][otherEvent.activity] = new Set();
            }
        }
        for (const event of subProcessTrace) {
            if (initializers.has(event.activity))
                spawned.add(event.attr.id);
            else {
                localAtLeastOnce[event.activity].add(event.attr.id);
                const seenAllBefore = new Set(Object.keys(localAtLeastOnce).filter(activity => (0, utility_1.copySet)(localAtLeastOnce[activity]).intersect(spawned).size === spawned.size));
                retval.conditions[event.activity].intersect(seenAllBefore);
                for (const otherEvent of subProcessTrace) {
                    if (initializers.has(otherEvent.activity))
                        continue;
                    responsesToSatisfy[otherEvent.activity][event.activity].delete(event.attr.id);
                    responsesToSatisfy[event.activity][otherEvent.activity].union(spawned);
                }
            }
        }
        for (const event in responsesToSatisfy) {
            if (initializers.has(event))
                continue;
            retval.responses[event].intersect(new Set(Object.keys(responsesToSatisfy[event]).filter(key => responsesToSatisfy[event][key].size === 0)));
        }
    }
    return retval;
};
exports.findConditionsResponses = findConditionsResponses;
