import Process, { ProcessRegistry } from "Process";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import { Position } from "source-map";
import { max } from "lodash";
import { gatherEnergy, moveToRoom } from "utils/creepUtils";
import { SpawnManager } from "SpawnManager";

const CONSTRUCTION_SITE_PRIORITES: Array<StructureConstant> = [STRUCTURE_SPAWN, STRUCTURE_WALL, STRUCTURE_RAMPART, STRUCTURE_TOWER, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER]
const MIN_RAMPART_HITS = (RAMPART_DECAY_AMOUNT / RAMPART_DECAY_TIME) * 2000


export interface ConstructionFinishedCallback extends Process {
    onConstructionFinished(type: StructureConstant, pos: RoomPosition): void
}


interface BuilderProcessMemory {
    scale: number,
    target: Id<ConstructionSite> | Id<StructureRampart> | undefined,
    callback: Pid<ConstructionFinishedCallback> | undefined
    room: string
    targetStructureType: StructureConstant | undefined,
    targetStructurePos: RoomPosition | undefined
}

enum BuilderCreepState {
    FETCHING,
    BUILDING
}
interface BuilderCreepMemory {
    state: BuilderCreepState,
    __fetchTarget: Id<_HasId> | undefined
}


export default class BuilderProcess extends CreepProcess<BuilderProcessMemory, BuilderCreepMemory> {
    scannedForTarget = false;
    initCreepMemory(): BuilderCreepMemory {
        return { state: BuilderCreepState.FETCHING, __fetchTarget: undefined }
    }

    onCreepDeath(): void {
    }

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, roomName: string, callback: ConstructionFinishedCallback | undefined = undefined) {
        super(kernel, parent, spawnManager, {
            scale: 5,
            callback: callback?.getPID(),
            room: roomName,
            target: undefined,
            targetStructureType: undefined,
            targetStructurePos: undefined
        })
    }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined]
    }
    selectTarget(): boolean {
        if (this.scannedForTarget) return false;
        console.log("scanning for target 222")
        this.scannedForTarget = true
        let derilectRamparts = Game.rooms[this.memory.room].find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_RAMPART && s.hits < MIN_RAMPART_HITS })
        console.log(derilectRamparts)
        if (derilectRamparts.length > 0) {
            this.memory.target = derilectRamparts[0].id as Id<StructureRampart>
            return true
        }
        let constructionSite = Game.rooms[this.memory.room].find(FIND_CONSTRUCTION_SITES);
        for (let structureType of CONSTRUCTION_SITE_PRIORITES) {
            let targetSites = _.filter(constructionSite, (site: ConstructionSite) => site.structureType == structureType)
            if (targetSites.length > 0) {
                constructionSite = targetSites;
                break
            }
        }

        if (constructionSite.length == 0) return false;
        this.memory.target = constructionSite[0].id;
        this.memory.targetStructureType = constructionSite[0].structureType;
        this.memory.targetStructurePos = constructionSite[0].pos;
        return true;
    }
    getSpawningPriority(): number {
        return 1
    }

    runCreep(c: Creep, creepMemory: BuilderCreepMemory): void {
        if (c.room.name != this.memory.room || c.pos.x == 49 || c.pos.y == 49 || c.pos.y == 0 || c.pos.x == 0) {
            moveToRoom(c, this.memory.room)
            return
        }
        if (!creepMemory.state) {
            creepMemory.state = BuilderCreepState.FETCHING
        }
        if (creepMemory.state == BuilderCreepState.FETCHING) {
            if (c.store.getFreeCapacity() == 0) {
                creepMemory.state = BuilderCreepState.BUILDING
                return;
            }
            this.logEnergyConsumption(gatherEnergy(c, creepMemory))
        } else if (creepMemory.state == BuilderCreepState.BUILDING) {
            if (c.store.getUsedCapacity() == 0) {
                creepMemory.state = BuilderCreepState.FETCHING
                return;
            }
            if (!this.memory.target) {
                if (!this.selectTarget()) {
                    this.shutdown();
                    return;
                }
            }
            let targetObj = Game.getObjectById(this.memory.target!)
            if (!targetObj) {
                if (this.memory.callback) {
                    try {
                        (this.kernel.getProcess(this.memory.callback) as unknown as ConstructionFinishedCallback).onConstructionFinished(this.memory.targetStructureType!,
                            new RoomPosition(this.memory.targetStructurePos!.x, this.memory.targetStructurePos!.y, this.memory.targetStructurePos!.roomName));
                    } catch (e) {
                        console.log(e);
                    }
                }
                if (!this.selectTarget()) {
                    this.shutdown();
                    return;
                }
            }

            if (targetObj instanceof StructureRampart) {
                let repairResult = c.repair(targetObj)
                if (repairResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(targetObj, { maxRooms: 1 })
                } else if (repairResult != OK) {
                    if (!this.selectTarget()) {
                        this.shutdown()
                        return
                    }
                }
                if (targetObj.hits > MIN_RAMPART_HITS * 2) {

                    if (!this.selectTarget()) {
                        this.shutdown()
                        return
                    }
                }
            } else {
                let buildResult = c.build(targetObj as ConstructionSite)
                if (buildResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(targetObj as ConstructionSite)
                } else if (buildResult == ERR_INVALID_TARGET) {
                    this.selectTarget();
                }
            }
        }
    }

    getScale(): number {
        return this.memory.scale;
    }
    setScale(n: number) {
        this.memory.scale = n
        this.memory.__spawningRatio = 0
        this.kernel.getProcess(this.memory.spawnManager)?.cancelSpawn(this.getPID())
        this.checkSpawning();
    }

    getType(): string {
        return "BuilderProcess"
    }

}

ProcessRegistry.register("BuilderProcess", BuilderProcess)
