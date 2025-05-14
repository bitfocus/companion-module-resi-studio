// types.d.ts
interface OAuthTokenResponse {
	access_token: string
	expires_in: number
}

interface Encoder {
	id: string
	name: string
}

interface DestinationGroup {
	id: string
	name: string
}

interface Schedule {
	encoderId: string
	scheduleId: string // This is the ID of the schedule in Resi Studio
	scheduleIdLocation: string // This is the URI location of the schedule in Resi Studio
	destinationGroupId: string
	destinations?: {
		id: string
		name: string
		type: string
		status: string
	}[]
}

interface ScheduleResponse {
	id: string
	destinations: ScheduleDestination[]
	actions: {
		stop: {
			method: string
			url: string
		}
	}
}

interface ScheduleDestination {
	id: string
	name: string
	type: string
	status: string
}
