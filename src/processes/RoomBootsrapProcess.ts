import Kernel from "Kernel";
import Process, { ProcessRegistry } from "../Process";
import CreepProcess from "./CreepProcess";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";
import { SpawnManager } from "SpawnManager";

type RoomBootstrapSource = StructureContainer | StructureStorage | Source | Resource | StructureLink

interface RoomBootstrapProcessMemory {
    room: string
}

enum BootstrapCreepState {
    FETCHING = 0,
    DEPOSITING = 1
}
interface BootstrapCreepMemory {
    hasSlept: boolean
    state: BootstrapCreepState
    source: Id<RoomBootstrapSource> | undefined
    destination: Id<StructureExtension | StructureSpawn | ConstructionSite> | undefined
}

export class RoomBootstrapProcess extends CreepProcess<RoomBootstrapProcessMemory, BootstrapCreepMemory> {


    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], 1, undefined, undefined]
    }

    getSpawningPriority(): number {
        return 999999999
    }


    constructor(kernel: Kernel, parent: SpawnManager, roomName: string) {
        super(kernel, parent, parent, { room: roomName })
    }
    runCreep(c: Creep, creepMemory: BootstrapCreepMemory): void {
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        if (creepMemory.state == BootstrapCreepState.FETCHING) {
            if (!creepMemory.source || !Game.getObjectById(creepMemory.source)) {
                let objects: RoomBootstrapSource[] = []
                let structures = c.room.find(FIND_STRUCTURES, { filter: (s) => (s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_STORAGE || s.structureType == STRUCTURE_LINK) && s.store[RESOURCE_ENERGY] >= c.store.getFreeCapacity() }) as RoomBootstrapSource[]
                objects = objects.concat(structures)
                let dropped_resources = c.room.find(FIND_DROPPED_RESOURCES, { filter: (s) => s.resourceType == RESOURCE_ENERGY && s.amount >= c.store.getFreeCapacity() })
                objects = objects.concat(dropped_resources)
                if (objects.length > 0) {
                    creepMemory.source = c.pos.findClosestByRange(objects)!.id
                } else {
                    creepMemory.source = c.pos.findClosestByRange(FIND_SOURCES, { filter: (s) => s.energy > 0 })?.id
                    if (!creepMemory.source) {
                        return
                    }
                }
            }

            let source = Game.getObjectById(creepMemory.source)
            if (!source) return;
            if (source instanceof Source) {
                let harvestResult = c.harvest(source)
                if (harvestResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(source)
                } else if (harvestResult != OK) {
                    creepMemory.source = undefined
                }
            } else if (source instanceof Structure) {
                let withdrawResult = c.withdraw(source, RESOURCE_ENERGY)
                if (withdrawResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(source)
                } else {
                    creepMemory.source = undefined
                }

            } else if (source instanceof Resource) {
                let pickupResult = c.pickup(source)
                if (pickupResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(source)
                } else {
                    creepMemory.source = undefined
                }
            }
            if (c.store.getFreeCapacity() == 0) {
                creepMemory.state = BootstrapCreepState.DEPOSITING
            }
        } else if (creepMemory.state == BootstrapCreepState.DEPOSITING) {
            if (c.store.getUsedCapacity() == 0) {
                creepMemory.state = BootstrapCreepState.FETCHING
                creepMemory.source = undefined
                return
            }
            if (!creepMemory.destination) {
                let transferTarget = c.pos.findClosestByRange(FIND_MY_STRUCTURES, { filter: (struct) => (struct.structureType == STRUCTURE_SPAWN || struct.structureType == STRUCTURE_EXTENSION) && struct.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
                if (!transferTarget) {
                    let buildTarget = c.pos.findClosestByRange(FIND_CONSTRUCTION_SITES, { filter: (structure) => structure.structureType == STRUCTURE_SPAWN });
                    if (!buildTarget) {
                        if (creepMemory.hasSlept) {
                            this.shutdown()
                        } else {
                            creepMemory.hasSlept = true
                            this.sleep(10)
                        }
                        return
                    } else {
                        creepMemory.destination = buildTarget.id
                    }
                } else {
                    creepMemory.destination = transferTarget.id as Id<StructureSpawn | StructureExtension>;
                }
            }
            let destination = Game.getObjectById(creepMemory.destination)
            if (!destination) {
                creepMemory.destination = undefined
                return
            }
            creepMemory.hasSlept = true
            if (destination instanceof Structure) {
                let depositResult = c.transfer(destination, RESOURCE_ENERGY)
                if (depositResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(destination)
                } else {
                    creepMemory.destination = undefined
                }
            } else if (destination instanceof ConstructionSite) {
                let buildResult = c.build(destination)
                if (buildResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(destination)
                } else if (buildResult != OK) {
                    creepMemory.destination = undefined
                }
            }
        }
    }

    initCreepMemory(): BootstrapCreepMemory {
        return { state: BootstrapCreepState.FETCHING, source: undefined, destination: undefined, hasSlept: false }
    }

    onCreepDeath(): void {
    }


    getType(): string {
        return "RoomBootstrapProcess"
    }

}

ProcessRegistry.register("RoomBootstrapProcess", RoomBootstrapProcess)



