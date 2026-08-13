import { moveToRoom } from "utils/creepUtils";
import CreepProcess from "./CreepProcess";
import { ProcessRegistry } from "Process";
import RoomManagerProcess from "./RoomManagerProcess";
import Kernel from "Kernel";

export default class ScoutProcess extends CreepProcess<{ nextExit: RoomPosition | undefined, nextRoom: string | undefined }> {

    constructor(kernel: Kernel, roomManager: RoomManagerProcess) {
        super(kernel, roomManager, roomManager, {
            nextExit: undefined,
            nextRoom: undefined
        })
    }
    initCreepMemory(): {} {
        return {}
    }

    getSpawningPriority(): number {
        return 0
    }

    setRoom(roomName: string) {
        this.memory.room = roomName
    }

    runCreep(c: Creep, creepMemory: { nextExit: RoomPosition | undefined, nextRoom: string | undefined }): void {
        if (c.room.name == creepMemory.nextRoom || !creepMemory.nextRoom || !creepMemory.nextExit) {
            let exits = Game.map.describeExits(c.room.name)!
            let leastRecentlyScoutedRoom = undefined
            let leastRecentlyScoutedExit: FindConstant = FIND_EXIT_TOP
            let leastRecentlyScoutedTime = Infinity
            for (let entry of Object.entries(exits)) {
                const [exit, room] = entry
                let multiplyer = 2
                if (Memory.room_intel[room]?.intel?.roomType == "ownedRoom") {
                    multiplyer = 3
                } else if (Memory.room_intel[room]?.intel?.roomType == "highway") {
                    multiplyer = 1
                }
                let lastScouted = (Memory.room_intel[room]?.lastScouted || 1) * multiplyer
                if (lastScouted < leastRecentlyScoutedTime || leastRecentlyScoutedRoom == undefined) {
                    leastRecentlyScoutedRoom = room
                    leastRecentlyScoutedExit = Number(exit) as FindConstant
                    leastRecentlyScoutedTime = lastScouted
                }
            }
            let nextExit = c.pos.findClosestByRange(c.room.find(leastRecentlyScoutedExit) as RoomPosition[])
            creepMemory.nextRoom = leastRecentlyScoutedRoom
            creepMemory.nextExit = nextExit!
        }
        let move_result = c.moveTo(creepMemory.nextExit.x, creepMemory.nextExit.y, { reusePath: 50 })
        if (move_result == ERR_NO_PATH) {
            creepMemory.nextRoom = undefined
            creepMemory.nextExit = undefined
            c.moveTo(c.pos.findClosestByPath(FIND_EXIT)!)
        }
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
