type SourceKeeperIntel = {
    roomType: "sourceKeeper"
    mineral: MineralConstant
    structuresBuilt: boolean
    otherCreeps: boolean
}

type HighwayIntel = {
    roomType: "highway",
    hostileCreeps: boolean
}

type OwnedRoomIntel = {
    roomType: "ownedRoom"
    player: string
    mineral: MineralConstant
    rcl: number,
    sources: number
}

type UnownedRoomIntel = {
    roomType: "unownedRoom",
    mineral: MineralConstant
    sources: number
    hostileCreepsPresent: boolean
}
type ReservedRoomIntel = {
    roomType: "reservedRoom",
    mineral: MineralConstant
    sources: number
    reserverUsername: string
}

export type RoomIntel = {
    lastScouted: number
    intel: OwnedRoomIntel | HighwayIntel | SourceKeeperIntel | UnownedRoomIntel | ReservedRoomIntel
}

export function scanRoom(room: Room) {

    if (!Memory.room_intel) Memory.room_intel = {}
    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(room.name)!;
    let isHighway = (+parsed[1] % 10 === 0) || +parsed[2] % 10 === 0
    if (isHighway) {
        Memory.room_intel[room.name] = {
            lastScouted: Game.time,
            intel: {
                roomType: "highway",
                hostileCreeps: room.find(FIND_HOSTILE_CREEPS).length > 0
            }
        }
    } else {
        let mineral = room.find(FIND_MINERALS)[0].mineralType
        let source_count = room.find(FIND_SOURCES).length
        if (room.controller) {
            if (room.controller.owner) {
                Memory.room_intel[room.name] = {
                    lastScouted: Game.time,
                    intel: {
                        roomType: "ownedRoom",
                        player: room.controller.owner.username,
                        mineral: mineral,
                        rcl: room.controller.level,
                        sources: source_count
                    }
                }
            } else if (room.controller.reservation) {
                Memory.room_intel[room.name] = {
                    lastScouted: Game.time,
                    intel: {
                        roomType: "reservedRoom",
                        sources: source_count,
                        mineral: mineral,
                        reserverUsername: room.controller.reservation.username
                    }
                }
            } else {
                let creeps = room.find(FIND_HOSTILE_CREEPS)
                Memory.room_intel[room.name] = {
                    lastScouted: Game.time,
                    intel: {
                        roomType: "unownedRoom",
                        mineral: mineral,
                        sources: source_count,
                        hostileCreepsPresent: creeps.length > 0
                    }
                }
            }
        } else {
            let structures = room.find(FIND_STRUCTURES)
            Memory.room_intel[room.name] = {
                lastScouted: Game.time,
                intel: {
                    roomType: "sourceKeeper",
                    mineral: mineral,
                    structuresBuilt: structures.length > 0,
                    otherCreeps: room.find(FIND_HOSTILE_CREEPS).length > 0
                }
            }
        }
    }
}