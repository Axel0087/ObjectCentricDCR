import { EntityRels, EventKnowledgeGraph } from "../types";

export type Cardinalities = { [entityType1: string]: LocalCardinalities };

export type LocalCardinalities = { [entityType2: string]: number };

export const findTransitiveCardinalities = (ekg: EventKnowledgeGraph, closures: Array<Set<string>>) => {
    const retval: Cardinalities = {};

    for (const closure of closures) {
        for (const e1 of closure) {
            const e1t = ekg.entityNodes[e1].entityType;
            const localCardinalities: { [et: string]: number } = {};
            for (const e2 of closure) {
                if (e1 === e2) continue;
                const e2t = ekg.entityNodes[e2].entityType;

                if (!localCardinalities[e2t]) localCardinalities[e2t] = 0;
                localCardinalities[e2t] += 1;
            }

            if (!retval[e1t]) retval[e1t] = {};
            for (const e2t in localCardinalities) {
                if (!retval[e1t][e2t]) retval[e1t][e2t] = 0;
                if (localCardinalities[e2t] > retval[e1t][e2t]) {
                    retval[e1t][e2t] = localCardinalities[e2t];
                }
            }
        }
    }

    return retval;
}

export const findCardinalities = (ekg: EventKnowledgeGraph, include_entities: Array<string>): Cardinalities => {
    const retval: Cardinalities = {};

    for (const e1 in ekg.entityRels) {
        const e1t = ekg.entityNodes[e1].entityType;
        if (!include_entities.includes(e1t)) continue;
        const localCardinalities: { [et: string]: number } = {};
        for (const e2 of ekg.entityRels[e1]) {
            const e2t = ekg.entityNodes[e2].entityType;
            if (!include_entities.includes(e2t)) continue;
            if (!localCardinalities[e2t]) localCardinalities[e2t] = 0;
            localCardinalities[e2t] += 1;
        }

        if (!retval[e1t]) retval[e1t] = {};
        for (const e2t in localCardinalities) {
            if (!retval[e1t][e2t]) retval[e1t][e2t] = 0;
            if (localCardinalities[e2t] > retval[e1t][e2t]) retval[e1t][e2t] = localCardinalities[e2t];
        }
    }

    return retval;
}

