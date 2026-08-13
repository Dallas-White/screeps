import Kernel from "Kernel"
import Process, { ProcessRegistry } from "../Process"
import CreepProcess from "./CreepProcess"
import { EnergyProducer } from "utils/EnergyBalance";
import { moveToRoom } from "utils/creepUtils";
import { forEachRight } from "lodash";
import { SpawnManager } from "SpawnManager";
import RoomManagerProcess from "./RoomManagerProcess";
import { CarrierJobFinishedCallback } from "./LogisticsManager";
import RemoteMiner from "./RemoteMiner";
const ENERGY_MINING_ALPHA = 0.01
interface HarvesterProcessMemory {
    source: Id<Source>,
    freeSpaces: number
    link: Id<StructureLink> | undefined
    minedEnergy: number
    miningTimer: number
    container: RoomPosition | undefined
    containerID: Id<StructureContainer> | undefined
    pushRequest: LogisticsTaskID | undefined
    room: string
}
export default class HarvesterProcess extends CreepProcess<HarvesterProcessMemory, {}> implements EnergyProducer, CarrierJobFinishedCallback {

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        if (Game.getObjectById(this.memory.source) && !this.memory.freeSpaces) {
            let sourcePos = (Game.getObjectById(this.memory.source) as Source).pos;
            let terrain = (Game.getObjectById(this.memory.source) as Source).room.getTerrain()
            let freeSpaces = 0
            for (var x = sourcePos.x - 1; x <= sourcePos.x + 1; x++) {
                if (x >= 50 || x == sourcePos.x || x < 0) continue;
                for (var y = sourcePos.y - 1; y <= sourcePos.y + 1; y++) {
                    if (y >= 50 || y == sourcePos.y || y < 0) continue;
                    if (terrain.get(x, y) != TERRAIN_MASK_WALL) freeSpaces++
                }
            }
            this.memory.freeSpaces = freeSpaces
        }
        if (Game.getObjectById(this.memory.source) && (Game.getObjectById(this.memory.source)! as Source).room.energyCapacityAvailable == 0) return [[WORK, MOVE], 6, [], 1]
        if (this.memory.link) return [[WORK], 12, [MOVE, CARRY], this.memory.freeSpaces]
        return [[WORK], 12, [MOVE], this.memory.freeSpaces]
    }

    initCreepMemory(): {} {
        return {}
    }

    getSpawningPriority(): number {
        return this.getParent() instanceof RemoteMiner ? 900 : 99999999
    }
    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, source: Source) {
        super(kernel, parent, spawnManager, {
            source: source.id,
            freeSpaces: 0,
            link: undefined,
            minedEnergy: 0,
            miningTimer: 0,
            container: undefined,
            containerID: undefined,
            pushRequest: undefined,
            room: source.room.name
        });
        this.findAdjacentContainers()
        this.resetEnergyProduction()
    }
    onCarrierJobFinished(id: LogisticsTask): void {
        this.memory.pushRequest = undefined
    }

    resetEnergyProduction(): void {
        this.memory.miningTimer = Game.time;
        this.memory.minedEnergy = 0
    }

    getEnergyProduced(): number {
        return this.memory.minedEnergy
    }

    getProductionTimer(): number {
        return Game.time - this.memory.miningTimer
    }

    getAverageEnergyProduction(): number {
        return this.memory.minedEnergy
    }

    runCreep(c: Creep): void {
        let src = Game.getObjectById(this.memory.source) as Source;
        let mineResult = c.harvest(src);
        if ((!this.memory.containerID || !this.memory.link) && Game.time % 1000 == 0) {
            this.findAdjacentContainers()
        }
        if (this.memory.room && this.memory.room != c.room.name) {
            moveToRoom(c, this.memory.room)
            return
        } else if (!this.memory.room && src) {
            this.memory.room = src.room.name
        } else if (!src) {
            return
        }
        if (this.memory.containerID) {
            let container = Game.getObjectById(this.memory.containerID)
            if (container && container.store.getFreeCapacity() < 500 && this.memory.room) {
                if (!this.memory.pushRequest) {
                    this.memory.pushRequest = this.kernel.getProcess((this.memory.spawnManager) as Pid<RoomManagerProcess>)?.getLogisticsManager().addLogisticTask({ source: this.memory.containerID, resource: RESOURCE_ENERGY, amount: 1500, callback: this.getPID(), dest: undefined, priority: 250 })
                } else {
                    this.kernel.getProcess((this.memory.spawnManager) as Pid<RoomManagerProcess>)?.getLogisticsManager().resizeTask(this.memory.pushRequest, 1500)
                }
            }
        }
        if (this.memory.container && (c.pos.x != this.memory.container.x || c.pos.y != this.memory.container.y || c.pos.roomName != this.memory.container.roomName)) {
            c.moveTo(new RoomPosition(this.memory.container.x, this.memory.container.y, this.memory.container.roomName))
            this.memory.minedEnergy *= (1 - ENERGY_MINING_ALPHA)
            return
        } else if (mineResult == ERR_NOT_IN_RANGE) {
            c.moveTo(src)
        } else if (mineResult == ERR_TIRED) {
            this.sleep(Math.min(c.ticksToLive || 1, src.ticksToRegeneration))
        }
        if (mineResult == OK) {
            if (this.memory.link && c.store.getFreeCapacity() < c.getActiveBodyparts(WORK) * HARVEST_POWER) {
                c.transfer(Game.getObjectById(this.memory.link) as StructureLink, RESOURCE_ENERGY)
            }
            this.memory.minedEnergy = this.memory.minedEnergy * (1 - ENERGY_MINING_ALPHA) + (HARVEST_POWER * c.body.filter((p) => p.type == WORK).length) * ENERGY_MINING_ALPHA
        } else {
            this.memory.minedEnergy *= (1 - ENERGY_MINING_ALPHA)
        }
    }

    findAdjacentContainers() {
        let container = (Game.getObjectById(this.memory.source) as Source).pos.findInRange(FIND_STRUCTURES, 1, { filter: (x) => x.structureType == STRUCTURE_CONTAINER })
        if (container.length != 0) {
            this.memory.container = container[0].pos
            this.memory.containerID = container[0].id as Id<StructureContainer>
            this.checkSpawning()
        } else {
            this.memory.container = undefined
        }
        let link = (Game.getObjectById(this.memory.source) as Source).pos.findInRange(FIND_STRUCTURES, 2, { filter: (x) => x.structureType == STRUCTURE_LINK })
        if (link.length != 0) {
            this.memory.link = link[0].id as Id<StructureLink>
            this.checkSpawning()
        } else {
            this.memory.link = undefined
        }
    }
    onCreepDeath(): void { }


    getType(): string {
        return "HarvesterProcess"
    }

}

ProcessRegistry.register("HarvesterProcess", HarvesterProcess)
