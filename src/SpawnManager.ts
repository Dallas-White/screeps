interface SpawnManager {
    getMaxEnergy(): number;
    addToQueue(body: BodyPartConstant[], priority: number, targetRoom: string | undefined, spawnCallback: SpawnCallback, callbackValues: any): boolean;
    cancelSpawn(pid: number): void
}

interface SpawnCallback {
    onCreepSpawned(name: string, values: any): void;
    getPID(): number;
}
