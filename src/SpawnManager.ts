import Process from "Process";

export interface SpawnManager extends Process {
    getMaxEnergy(): number;
    addToQueue<T>(body: BodyPartConstant[], priority: number, targetRoom: string | undefined, spawnCallback: SpawnCallback<T>, callbackValues: T): boolean;
    cancelSpawn(pid: number): void
}

export interface SpawnCallback<T> extends Process {
    onCreepSpawned(name: string, values: T): void;
}
