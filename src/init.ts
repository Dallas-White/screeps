import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import { FlagHandler } from "processes/flagHandlers/flagHandler";
import RoomManagerProcess from "processes/RoomManagerProcess";
import { SpawnCallback, SpawnManager } from "SpawnManager";
import { scanRoom } from "utils/roomIntel";


interface initMemory {
    rooms: Record<string, Pid<RoomManagerProcess>>
    flagHandler: Pid<FlagHandler> | undefined
}
export default class init extends Process<initMemory> implements SpawnManager {

    constructor(kernel: Kernel) {
        super(kernel, 0, {
            rooms: {},
            flagHandler: undefined
        })
    }

    getRoomManager(roomName: string): Pid<RoomManagerProcess> | undefined {
        return this.memory.rooms[roomName]
    }

    getMaxEnergy(): number {
        let maxEnergy = 0
        for (let x of Object.values(this.memory.rooms)) {
            let currentEnergy = (this.kernel.getProcess(x)!).getMaxEnergy(true)
            if (currentEnergy > maxEnergy) maxEnergy = currentEnergy
        }
        return maxEnergy
    }
    addToQueue<T>(body: BodyPartConstant[], priority: number, targetRoom: string | undefined, spawnCallback: SpawnCallback<T>, callbackValues: T): boolean {
        let bodyCost = _.sum(_.map(body, (part) => BODYPART_COST[part]))
        let rooms = Object.keys(this.memory.rooms)
        if (targetRoom) {
            rooms.sort((a, b) => Game.map.getRoomLinearDistance(a, targetRoom) - Game.map.getRoomLinearDistance(b, targetRoom))
        }

        for (let x of rooms) {
            let roomManager = this.kernel.getProcess(this.memory.rooms[x])!
            if (roomManager.getMaxEnergy(true) >= bodyCost) {
                return roomManager.addToQueue(body, priority, targetRoom, spawnCallback, callbackValues)
            }
        }
        return false

    }
    cancelSpawn(pid: number): void {
        for (let x of Object.values(this.memory.rooms)) {
            this.kernel.getProcess(x)?.cancelSpawn(pid, false)
        }
    }
    run(): void {
        if (!this.memory.rooms) this.memory.rooms = {}
        let filteredRooms = _.filter(Object.keys(this.memory.rooms), (s: string) => !(s in Game.rooms) || !this.kernel.getProcess(this.memory.rooms[s]))
        for (let x of filteredRooms) {
            delete this.memory.rooms[x]
        }
        for (let x of Object.keys(Game.rooms)) {
            scanRoom(Game.rooms[x])
            if (x in this.memory.rooms) continue
            if (!Game.rooms[x].controller?.my) continue
            let rmp = new RoomManagerProcess(Game.rooms[x], this.kernel, this)
            this.kernel.addProcess(rmp)
            this.memory.rooms[x] = rmp.getPID();
        }
        if (!this.memory.flagHandler) {
            let flagHandlerProcess = new FlagHandler(this.kernel, this)
            this.kernel.addProcess(flagHandlerProcess)
            this.memory.flagHandler = flagHandlerProcess.getPID()
        }

    }

    getType(): string {
        return "init"
    }

}

ProcessRegistry.register("init", init);
