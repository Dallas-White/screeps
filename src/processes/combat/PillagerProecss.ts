import { open } from "fs";
import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";
import { moveToRoom } from "utils/creepUtils";
import { EnergyConsumer, EnergyProducer } from "utils/EnergyBalance";

interface PillagerProcessMemory {
    source: string,
    destination: string,
    scale: number
}

enum PillagerCreepState {
    DEPOSITING = 0,
    FETCHING = 1
}
interface PillagerCreepMemory {
    state: PillagerCreepState
}
export default class PillagerProcess extends CreepProcess<PillagerProcessMemory, PillagerCreepMemory> {
    initCreepMemory(): PillagerCreepMemory {
        return { state: PillagerCreepState.FETCHING }
    }

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, source: string, destination: string, scale: number) {
        super(kernel, parent, spawnManager, {
            source: source,
            destination: destination,
            scale: scale
        })
        this.memory.source = source;
        this.memory.destination = destination;
        this.memory.scale = scale
    }
    getSpawningPriority(): number {
        return 0;
    }
    setScale(newScale: number): void {
        this.memory.scale = newScale
    }
    runCreep(c: Creep, creepMemory: PillagerCreepMemory): void {
        if (creepMemory.state == PillagerCreepState.DEPOSITING) {
            if (c.room.name != this.memory.destination || c.pos.x == 49 || c.pos.x == 0 || c.pos.y == 49 || c.pos.y == 0) {
                moveToRoom(c, this.memory.destination)
            } else {
                let openStorage = c.room.storage ? c.room.storage : c.pos.findClosestByRange(FIND_STRUCTURES, { filter: (s => (s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_STORAGE) && s.store.getFreeCapacity() > 0) })
                if (!openStorage) {
                    for (var resource of RESOURCES_ALL) {
                        if (c.store.getUsedCapacity(resource) > 0) {
                            c.drop(resource)
                        }
                    }
                } else {
                    for (var resource of RESOURCES_ALL) {
                        if (c.store.getUsedCapacity(resource) > 0) {
                            let depositResult = c.transfer(openStorage, resource);
                            if (depositResult == ERR_NOT_IN_RANGE) {
                                c.moveTo(openStorage);
                                return;
                            }
                        }
                    }
                }
            }
            if (c.store.getUsedCapacity() == 0) creepMemory.state = PillagerCreepState.FETCHING
        } else {
            if (c.room.name != this.memory.source) {
                moveToRoom(c, this.memory.source)
            } else {

                if (c.store.getFreeCapacity() == 0) creepMemory.state = PillagerCreepState.DEPOSITING
                let source = c.pos.findClosestByRange(FIND_DROPPED_RESOURCES)
                if (!source) {
                    let container: StructureContainer = c.pos.findClosestByRange(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_CONTAINER && (s as StructureContainer).store.getUsedCapacity() > 0 })!
                    if (!container) {
                        this.sleep(5);
                        return;
                    }

                    for (var resource of RESOURCES_ALL) {
                        if (container.store[resource] > 0) {
                            if (c.withdraw(container, resource) == ERR_NOT_IN_RANGE) {
                                c.moveTo(container);
                            }
                            return;
                        }
                    }
                    return;
                }
                let result = c.pickup(source);
                if (result == ERR_NOT_IN_RANGE) c.moveTo(source);
                if (c.store.getFreeCapacity() == 0) creepMemory.state = PillagerCreepState.DEPOSITING
            }
        }
    }
    onCreepDeath(): void { }
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, CARRY, CARRY], this.memory.scale, [], undefined]
    }
    getType(): string {
        return "PillagerProcess"
    }


}
ProcessRegistry.register("PillagerProcess", PillagerProcess)