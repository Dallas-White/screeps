import Kernel from "Kernel";
import CreepProcess from "./CreepProcess";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import Process, { ProcessRegistry } from "Process";
import { SpawnManager } from "SpawnManager";

interface RepairProcessMemory {
    room: string,
    estimatedEnergyNeeded: number
    scale: number
}

export default class RepairerProcess extends EnergyCreepProcess<RepairProcessMemory> {

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, roomName: string) {
        super(kernel, parent, spawnManager, roomName, { room: roomName, estimatedEnergyNeeded: 0, scale: 3 });
    }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        if (this.memory.estimatedEnergyNeeded == 0 || Game.time % 1000 == 0) {
            this.memory.estimatedEnergyNeeded = RepairerProcess.calculateRepairEnergyPerTickPerRoom(this.memory.room)
            this.checkSpawning();
        }
        if (this.getConsumptionTimer() > 1000 && this.getConsumptionTimer() % 2000 == 0) {
            let usagePerCreep = this.getAverageEnergyConsumption() / this.getAliveScale()
            this.memory.scale = Math.max(3, Math.ceil(this.memory.estimatedEnergyNeeded / usagePerCreep))
        } else {
            this.memory.scale = 3
        }
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined]
    }

    static calculateRepairEnergyPerTickPerRoom(roomName: string): number {
        let room = Game.rooms[roomName]
        let terrain = room.getTerrain()
        let containers = room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_CONTAINER }).length
        let ramparts = room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_RAMPART }).length
        let roadsOnSwamps = room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_ROAD && terrain.get(s.pos.x, s.pos.y) == TERRAIN_MASK_SWAMP }).length
        let roadsOnWalls = room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_ROAD && terrain.get(s.pos.x, s.pos.y) == TERRAIN_MASK_WALL }).length
        let roadsOnPlains = room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_ROAD && terrain.get(s.pos.x, s.pos.y) == 0 }).length
        return ((containers * (CONTAINER_DECAY / CONTAINER_DECAY_TIME) +
            ramparts * (RAMPART_DECAY_AMOUNT / RAMPART_DECAY_TIME) +
            roadsOnSwamps * (ROAD_DECAY_AMOUNT * CONSTRUCTION_COST_ROAD_SWAMP_RATIO / ROAD_DECAY_TIME) +
            roadsOnWalls + (ROAD_DECAY_AMOUNT * CONSTRUCTION_COST_ROAD_WALL_RATIO / ROAD_DECAY_TIME) +
            roadsOnPlains + (ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME)) / REPAIR_POWER) * 1.5 // This is multiplied by 1.5 to give us a safety factor */
    }

    killOnNoTarget(): boolean {
        return false
    }
    act(creep: Creep, target: Structure): actResult {
        if (creep.repair(target as Structure) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target as Structure)
        }
        if (target.hits == target.hitsMax || (target.structureType == STRUCTURE_RAMPART && target.hits > RAMPART_DECAY_AMOUNT * 4) || target.structureType == STRUCTURE_WALL) {
            return actResult.SELECTNEW
        } else {
            return actResult.CONTINUE
        }
    }

    selectTarget(pos: RoomPosition): _HasId | null {
        let dangerouslyDecayedStructures = Game.rooms[pos.roomName].find(FIND_STRUCTURES, {
            filter: function (x: Structure) {
                return (x.structureType == STRUCTURE_ROAD && x.hits < ROAD_DECAY_AMOUNT * 2) || (x.structureType == STRUCTURE_RAMPART && x.hits < RAMPART_DECAY_AMOUNT * 4)
            }
        })
        if (dangerouslyDecayedStructures.length != 0) return pos.findClosestByRange(dangerouslyDecayedStructures);
        let damagedStructures = Game.rooms[pos.roomName].find(FIND_STRUCTURES, {
            filter: function (x: Structure) {
                return (x.hits < x.hitsMax && x.structureType != STRUCTURE_WALL && x.structureType != STRUCTURE_RAMPART) || (x.structureType == STRUCTURE_RAMPART && x.hits <= RAMPART_DECAY_AMOUNT * 4);
            }
        })
        if (damagedStructures.length != 0) return pos.findClosestByRange(damagedStructures);

        let damagedDefenses = Game.rooms[pos.roomName].find(FIND_STRUCTURES, { filter: (struct) => (struct.structureType == STRUCTURE_WALL || struct.structureType == STRUCTURE_RAMPART) && struct.hits < struct.hitsMax })
        if (damagedDefenses.length == 0) return null;
        damagedDefenses.sort((a: AnyStructure, b: AnyStructure): number => {
            if (a.hits != b.hits) return a.hits - b.hits;
            return pos.getRangeTo(a) - pos.getRangeTo(b);
        })
        return damagedDefenses[0];
    }

    getSpawningPriority(): number {
        return 3;
    }

    getType(): string {
        return "RepairerProcess"
    }

}

ProcessRegistry.register("RepairerProcess", RepairerProcess)
