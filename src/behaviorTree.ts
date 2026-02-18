//Runs the provided functions until one returns true
function selector(c: Creep, ...functions: ((c: Creep) => boolean)[]) {
    for (const func of functions) {
        if (func(c)) return true;
    }
    return false;
}

