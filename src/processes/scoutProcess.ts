import { moveToRoom } from "utils/creepUtils";
import CreepProcess from "./CreepProcess";
import { ProcessRegistry } from "Process";

export default class ScoutProcess extends CreepProcess<{ nextExit: RoomPosition, nextRoom: string | undefined }> {
    initCreepMemory(): {} {
        return {}
    }

    getSpawningPriority(): number {
        return 0
    }

    setRoom(roomName: string) {
        this.memory.room = roomName
    }

    runCreep(c: Creep, creepMemory: { nextExit: RoomPosition, nextRoom: string | undefined }): void {
        if (c.room.name == creepMemory.nextRoom || !creepMemory.nextRoom) {
            let exits = Game.map.describeExits(c.room.name)!
            let leastRecentlyScoutedRoom = undefined
            let leastRecentlyScoutedExit: FindConstant = FIND_EXIT_TOP
            let leastRecentlyScoutedTime = 0
            for (let entry in Object.entries(exits)) {
                const [exit, room] = entry
                if ((Memory.room_intel[room]?.lastScouted || -1) <= leastRecentlyScoutedTime || leastRecentlyScoutedRoom == undefined) {
                    leastRecentlyScoutedRoom = room
                    leastRecentlyScoutedExit = Number(exit) as FindConstant
                    leastRecentlyScoutedTime = Memory.room_intel[room]?.lastScouted || 0
                }
            }
            let nextExit = c.pos.findClosestByRange(c.room.find(leastRecentlyScoutedExit) as RoomPosition[])
            creepMemory.nextRoom = leastRecentlyScoutedRoom
            creepMemory.nextExit = nextExit!
        }
        c.moveTo(creepMemory.nextExit)
    }
    onCreepDeath(): void { }
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE], 1, [], undefined]
    }
    getType(): string {
        return "ScoutProcess"
    }
}

ProcessRegistry.register("ScoutProcess", ScoutProcess)
