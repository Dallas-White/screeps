export function moveToRoom(creep: Creep, roomName: string) {
    if (creep.room.name == roomName) {
        creep.moveTo(25, 25)
        return;
    }
    if (!roomName) throw new Error("Invalid Room")
    if (!creep.memory.roomPath || creep.memory.roomPath.destination != roomName || creep.memory.roomPath.path.length == 0) {
        let path = Game.map.findRoute(creep.room.name, roomName, {
            routeCallback: (callbackRoom) => {
                if (!Memory.room_intel[callbackRoom]) {
                    return 100
                }
                let intel = Memory.room_intel[callbackRoom].intel
                if (intel.roomType == "highway" || intel.roomType == "unownedRoom" || (intel.roomType == "ownedRoom" && Game.rooms[callbackRoom]?.controller?.my) || (intel.roomType == "reservedRoom")) {
                    return 10
                }
                if (intel.roomType == "ownedRoom") {
                    return Infinity
                }
                return 100
            }
        })
        if (path == -2) throw new Error("Attempt to path to inaccessible room")
        creep.memory.roomPath = { path: path, destination: roomName }
    }
    if (creep.memory.roomPath.path.length == 0) {
        creep.memory.roomPath = undefined
        return
    }
    while (creep.memory.roomPath.path.length > 0 && creep.memory.roomPath.path[0].room === creep.room.name) {
        creep.memory.roomPath.path.shift();
    }
    if (creep.memory.roomPath.path.length === 0) {
        creep.memory.roomPath = undefined;
        return;
    }
    if (!creep.memory.roomPath.path[0]) {
        creep.memory.roomPath = undefined;
        return;
    }
    creep.moveTo(new RoomPosition(25, 25, creep.memory.roomPath.path[0].room), { maxRooms: 1, reusePath: 50 }) //TODO: this could be more efficient if it used exits, but that code caused a bug
}


export function gatherEnergy(creep: Creep, creepMemory: { __fetchTarget: undefined | Id<_HasId> }): number {
    let fetchTarget = creepMemory.__fetchTarget ? Game.getObjectById(creepMemory.__fetchTarget) : undefined
    if (!fetchTarget
        || (fetchTarget instanceof Structure
            && (fetchTarget as StructureContainer).store[RESOURCE_ENERGY] < 50)
        || (fetchTarget instanceof Resource
            && (fetchTarget as Resource).amount < 50)) {

        const droppedEnergy: _HasRoomPosition[] = creep.room.find(FIND_DROPPED_RESOURCES, { filter: (filter) => filter.resourceType == RESOURCE_ENERGY && filter.amount > 50 });
        let containers: _HasRoomPosition[] = creep.room.find(FIND_STRUCTURES, {
            filter: function (structure) {
                if (structure.structureType == STRUCTURE_STORAGE ||
                    structure.structureType == STRUCTURE_LINK || structure.structureType == STRUCTURE_CONTAINER) {
                    if (structure.store[RESOURCE_ENERGY] > 50) return true
                }
                return false

            }
        });
        containers = containers.concat(droppedEnergy)
        creepMemory.__fetchTarget = (creep.pos.findClosestByRange(containers) as unknown as _HasId)?.id
    }

    if (creepMemory.__fetchTarget) {
        let closest_container = Game.getObjectById(creepMemory.__fetchTarget)
        let energyPickedup = 0
        let result: ScreepsReturnCode = ERR_INVALID_ARGS
        if (closest_container instanceof Structure) {
            result = creep.withdraw(closest_container, RESOURCE_ENERGY)
            energyPickedup = Math.min((closest_container as StructureContainer).store[RESOURCE_ENERGY], creep.store.getCapacity())
        } else if (closest_container instanceof Resource) {
            energyPickedup = Math.min((closest_container.amount, creep.store.getCapacity()))
            result = creep.pickup(closest_container)
        } else {
            throw new Error("Invalid structure type")
        }
        if (result == ERR_NOT_IN_RANGE) {
            creep.moveTo(closest_container)
        } else if (result == OK) {
            creepMemory.__fetchTarget = undefined
            return energyPickedup;
        }
    }
    return 0;
}