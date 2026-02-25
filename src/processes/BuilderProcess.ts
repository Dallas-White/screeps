import { ProcessRegistry } from "Process";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import { Position } from "source-map";
import { max } from "lodash";
import { gatherEnergy, moveToRoom } from "utils/creepUtils";

const CONSTRUCTION_SITE_PRIORITES: Array<StructureConstant> = [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART]

export interface ConstructionFinishedCallback {
    onConstructionFinished(type: StructureConstant, pos: RoomPosition): void
    getPID(): number
}
export default class BuilderProcess extends CreepProcess {

    onCreepDeath(): void {
    }

    constructor(kernel: Kernel, parent: number, spawnManager: number, roomName: string, callback: ConstructionFinishedCallback | undefined = undefined) {
        super(kernel, parent, spawnManager)
        this.memory.room = roomName;
        this.memory.scale = 5
        this.memory.callback = callback?.getPID();
    }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined]
    }
    selectTarget(): boolean {
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

    runCreep(c: Creep, creepMemory: any): void {
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
        }
        if (!creepMemory.state) {
            creepMemory.state = "fetching"
        }
        if (creepMemory.state == "fetching") {
            if (c.store.getFreeCapacity() == 0) {
                creepMemory.state = "building"
                return;
            }
            this.logEnergyConsumption(gatherEnergy(c, creepMemory))
        } else if (creepMemory.state == "building") {
            if (c.store.getUsedCapacity() == 0) {
                creepMemory.state = "fetching"
                return;
            }
            if (!this.memory.target) {
                if (!this.selectTarget()) {
                    this.shutdown();
                    return;
                }
            }
            let targetObj = Game.getObjectById(this.memory.target)
            if (!targetObj) {
                if (this.memory.callback) {
                    try {
                        (this.kernel.getProcess(this.memory.callback) as unknown as ConstructionFinishedCallback).onConstructionFinished(this.memory.targetStructureType,
                            new RoomPosition(this.memory.targetStructurePos.x, this.memory.targetStructurePos.y, this.memory.targetStructurePos.roomName));
                    } catch (e) {
                        console.log(e);
                    }
                }
                if (!this.selectTarget()) {
                    this.shutdown();
                    return;
                }
            }
            let buildResult = c.build(targetObj as ConstructionSite)
            if (buildResult == ERR_NOT_IN_RANGE) {
                c.moveTo(targetObj as ConstructionSite)
            } else if (buildResult == ERR_INVALID_TARGET) {
                this.selectTarget();
            }
        }
    }

    getScale(): number {
        return this.memory.scale;
    }
    setScale(n: number) {
        this.memory.scale = n
        this.checkSpawning();
    }

    getType(): string {
        return "BuilderProcess"
    }

}

ProcessRegistry.register("BuilderProcess", BuilderProcess)
