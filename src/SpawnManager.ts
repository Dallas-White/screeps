interface SpawnManager {
    getMaxEnergy(): number;
    addToQueue(body: BodyPartConstant[], priority: number, spawnCallback: SpawnCallback, callbackValues: any): boolean;
    cancelSpawn(pid: number): void
}

interface SpawnCallback {
    onCreepSpawned(name: string, values: any): void;
    getPID(): number;
}
