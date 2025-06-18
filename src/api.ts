import { InstanceStatus } from '@companion-module/base'
import type { ResiStudioInstance } from './main.js'
import { API_BASE_URL, API_VERSION } from './constants.js'

// --- Connection Flow ---

export async function InitConnection(self: ResiStudioInstance): Promise<void> {
	self.updateStatus(InstanceStatus.Connecting, 'Connecting to Resi Studio')

	try {
		// Check if clientId and clientSecret are provided
		if (!self.config.clientId || !self.config.clientSecret) {
			self.log(
				'error',
				'Client ID and Client Secret are required to connect to Resi Studio. See module config for instructions.',
			)
			self.updateStatus(InstanceStatus.UnknownWarning, 'Client ID and Client Secret are required')
			return
		}

		await GetAccessToken(self)
		await GetEncoders(self)
		await GetDestinationGroups(self)

		//load any existing schedules from the config
		if (self.config.SCHEDULE_IDS) {
			self.SCHEDULE_IDS = self.config.SCHEDULE_IDS
		} else {
			self.SCHEDULE_IDS = []
		}
		self.log('info', `Loaded ${self.SCHEDULE_IDS.length} schedules from config`)

		StartPolling(self)

		self.updateActions()
		self.updateFeedbacks()
		self.updateVariableDefinitions()
	} catch (error: any) {
		self.log('error', `Connection failed: ${error.message || error}`)
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to connect to Resi Studio - see log for details')
	}
}

// --- Authentication ---

async function GetAccessToken(self: ResiStudioInstance): Promise<void> {
	const { clientId, clientSecret } = self.config

	if (!clientId || !clientSecret) {
		self.log('error', 'Client ID and Client Secret are required to connect to Resi Studio')
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Client ID and Client Secret are required')
		return
	}

	const apiAuthUrl = `${API_BASE_URL}/${API_VERSION}/oauth/token`
	LogVerbose(self, `Connecting to Resi Studio with Client ID: ${clientId}`)
	LogVerbose(self, `Using API URL: ${apiAuthUrl}`)

	try {
		const response = await fetch(apiAuthUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'client_credentials',
			}),
		})

		if (!response.ok) {
			self.log('error', `Failed to connect: ${response.statusText}`)
			return
		}

		const tokenData = (await response.json()) as OAuthTokenResponse
		LogVerbose(self, `Access Token: ${tokenData.access_token}`)
		LogVerbose(self, `Token Expires In: ${tokenData.expires_in} seconds`)

		if (!tokenData.access_token || !tokenData.expires_in) {
			self.log('error', 'Invalid response from Resi Studio API: Missing access token or expiry time.')
			self.updateStatus(InstanceStatus.ConnectionFailure, 'Invalid response from Resi Studio API')
			return
		}

		self.TOKEN = tokenData.access_token
		self.TOKEN_EXPIRY = Date.now() + tokenData.expires_in * 1000

		self.log('info', `Successfully connected to Resi Studio`)
		self.updateStatus(InstanceStatus.Ok, 'Connected to Resi Studio')
	} catch (error: any) {
		self.log('error', `Failed to connect to Resi Studio: ${error.message || error}`)
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to connect to Resi Studio - see log for details')
	}
}

// --- Token Expiry Check ---

async function CheckTokenExpiry(self: ResiStudioInstance): Promise<boolean> {
	if (!self.TOKEN || !self.TOKEN_EXPIRY) {
		self.log('error', 'Access token or expiry time is not set. Please check your connection.')
		return false
	}
	const currentTime = Date.now()
	if (currentTime >= self.TOKEN_EXPIRY - 5000) {
		// Check if the token is about to expire in 5 seconds
		self.log('warn', 'Access token has expired. Re-authenticating...')
		self.updateStatus(InstanceStatus.Connecting, 'Re-authenticating with Resi Studio')
		await GetAccessToken(self)

		if (!self.TOKEN) {
			self.log('error', 'Re-authentication failed. No access token obtained.')
			self.updateStatus(InstanceStatus.ConnectionFailure, 'Re-authentication failed - see log for details')
			return false
		}
	}
	return true
}

// --- Polling ---

async function Poll(self: ResiStudioInstance) {
	while (true) {
		//await GetEncoders(self)
		await GetDestinationGroups(self)

		for (const schedule of self.SCHEDULE_IDS) {
			await GetSchedule(self, schedule)
		}

		LogVerbose(self, '------------')

		await new Promise((r) => setTimeout(r, self.POLLING_RATE))
	}
}

function StartPolling(self: ResiStudioInstance) {
	self.log('info', 'Starting polling for data...')
	LogVerbose(self, `Polling every ${self.POLLING_RATE} milliseconds`)
	self.POLLING_RUNNING = true
	Poll(self)
}

export function StopPolling(self: ResiStudioInstance): void {
	if (self.POLLING_INTERVAL) {
		clearInterval(self.POLLING_INTERVAL)
		self.POLLING_INTERVAL = undefined
		self.log('info', 'Stopped polling for data.')
	}
}

// --- Fetch Encoders ---

async function GetEncoders(self: ResiStudioInstance): Promise<void> {
	if (await !CheckTokenExpiry(self)) return

	try {
		const apiEncodersUrl = `${API_BASE_URL}/${API_VERSION}/encoders?hardwareOnly=true`
		LogVerbose(self, `Retrieving Encoders from: ${apiEncodersUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiEncodersUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
		})

		logRequest(self)

		if (!response.ok) {
			const errorMessage = parseErrorResponse(self, response)
			self.log('error', errorMessage)
			const body = await response.text()
			LogVerbose(self, `Response body: ${body}`)
			throw new Error(errorMessage)
		}

		const encodersData = (await response.json()) as Encoder[]
		LogVerbose(self, `Retrieved Encoders data: ${JSON.stringify(encodersData)}`)

		self.log('info', `Loaded ${self.CHOICES_ENCODERS.length} encoders`)

		if (!encodersData || encodersData.length === 0) {
			self.log('warn', 'No encoders found in Resi Studio')
			self.updateStatus(InstanceStatus.UnknownWarning, 'No encoders found')
			self.CHOICES_ENCODERS = [{ id: 'default', label: 'Default Encoder' }]
			return
		}

		self.CHOICES_ENCODERS = encodersData.map((encoder) => ({
			id: encoder.id,
			label: encoder.name,
		}))

		LogVerbose(self, `Retrieved ${self.CHOICES_ENCODERS.length} Encoders from Resi Studio`)
	} catch (error: any) {
		self.log('error', `Failed to retrieve Encoders: ${error}`)
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to retrieve Encoders - see log for details')
	}
}

// --- Fetch Destination Groups ---

async function GetDestinationGroups(self: ResiStudioInstance): Promise<void> {
	if (await !CheckTokenExpiry(self)) return

	try {
		const apiDestinationsUrl = `${API_BASE_URL}/${API_VERSION}/destinationgroups`
		LogVerbose(self, `Retrieving Destination Groups from: ${apiDestinationsUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiDestinationsUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
		})

		logRequest(self)

		if (!response.ok) {
			const errorMessage = parseErrorResponse(self, response)
			self.log('error', errorMessage)
			const body = await response.text()
			LogVerbose(self, `Response body: ${body}`)
			throw new Error(errorMessage)
		}

		const destinationsData = (await response.json()) as DestinationGroup[]
		LogVerbose(self, `Retrieved Destination Groups data: ${JSON.stringify(destinationsData)}`)

		self.log('info', `Loaded ${self.CHOICES_DESTINATION_GROUPS.length} destination groups`)

		if (!destinationsData || destinationsData.length === 0) {
			self.log('warn', 'No destination groups found in Resi Studio')
			self.updateStatus(InstanceStatus.UnknownWarning, 'No destination groups found')
			self.CHOICES_DESTINATION_GROUPS = [{ id: 'default', label: 'Default Destination Group' }]
			return
		} else {
			//we are ok
			self.updateStatus(InstanceStatus.Ok)
		}

		self.CHOICES_DESTINATION_GROUPS = destinationsData.map((group) => ({
			id: group.id,
			label: group.name,
		}))
		LogVerbose(self, `Retrieved ${self.CHOICES_DESTINATION_GROUPS.length} Destination Groups from Resi Studio`)

		//get the destination group info for each group
		/*for (const group of self.CHOICES_DESTINATION_GROUPS) {
			await GetDestinationGroupInfo(self, group.id)
		}*/
	} catch (error: any) {
		self.log('error', `Failed to retrieve Destination Groups: ${error}`)
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to retrieve Destination Groups - see log for details')
	}
}

// --- Fetch Destination Group Info --- (not used yet)

/*async function GetDestinationGroupInfo(self: ResiStudioInstance, destinationGroupId: string): Promise<void> {
	if (await !CheckTokenExpiry(self)) return
	try {
		const apiDestinationsUrl = `${API_BASE_URL}/${API_VERSION}/destinationgroups/${destinationGroupId}`
		LogVerbose(self, `Fetching destination group info from: ${apiDestinationsUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiDestinationsUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
		})

		logRequest(self)

		if (!response.ok) {
			self.log('error', `Failed to fetch destination group info: ${response.statusText}`)
			//self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to fetch destination group info - see log for details')
			return
		}
		const destinationGroupData = await response.json()
		LogVerbose(self, `Fetched destination group info data: ${JSON.stringify(destinationGroupData)}`)
	}
	catch (error: any) {
		self.log('error', `Failed to fetch destination group info: ${error.message || error}`)
		//self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to fetch destination group info - see log for details')
	}
}*/

// --- Fetch Destination Info --- (not used yet)

/*async function GetDestinationInfo(self: ResiStudioInstance, destinationId: string): Promise<void> {
	if (await !CheckTokenExpiry(self)) return
	try {
		const apiDestinationsUrl = `${API_BASE_URL}/${API_VERSION}/destinations/${destinationId}`
		LogVerbose(self, `Fetching destination info from: ${apiDestinationsUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiDestinationsUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
		})

		logRequest(self)

		if (!response.ok) {
			self.log('error', `Failed to fetch destination info: ${response.statusText}`)
			//self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to fetch destination info - see log for details')
			return
		}
		const destinationData = await response.json()
		LogVerbose(self, `Fetched destination info data: ${JSON.stringify(destinationData)}`)
	} catch (error: any) {
		self.log('error', `Failed to fetch destination info: ${error.message || error}`)
		//self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to fetch destination info - see log for details')
	}
}*/

// --- Go Live ---

export async function GoLive(
	self: ResiStudioInstance,
	encoderId: string,
	destinationGroupId: string,
	title: string,
	description: string,
): Promise<void> {
	if (await !CheckTokenExpiry(self)) return

	try {
		const encoderName = self.CHOICES_ENCODERS.find((encoder) => encoder.id === encoderId)?.label || 'Unknown Encoder'
		const destinationGroupName =
			self.CHOICES_DESTINATION_GROUPS.find((group) => group.id === destinationGroupId)?.label ||
			'Unknown Destination Group'

		//if an entry already exists for this encoder ID and the same destination group ID, don't do anything because they probably pressed the button multiple times
		const existingSchedule = self.SCHEDULE_IDS.find(
			(schedule) => schedule.encoderId === encoderId && schedule.destinationGroupId === destinationGroupId,
		)
		if (existingSchedule) {
			self.log(
				'info',
				`Encoder "${encoderName}" (${encoderId}) is already live for Destination Group "${destinationGroupName}" (${destinationGroupId})`,
			)
			return
		}

		self.log(
			'info',
			`Starting Encoder "${encoderName}" (${encoderId}) with Destination Group "${destinationGroupName}" (${destinationGroupId})`,
		)

		const apiStartEncoderUrl = `${API_BASE_URL}/${API_VERSION}/schedules/live`
		LogVerbose(self, `Going Live: Using API URL: ${apiStartEncoderUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiStartEncoderUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
			body: JSON.stringify({ encoderId, destinationGroupId, title, description }),
		})

		logRequest(self)

		if (!response.ok) {
			const body = await response.text()
			LogVerbose(self, `Response body: ${body}`)

			const errorMessage = parseErrorResponse(self, response, body)
			self.log('error', errorMessage)

			AddEncoderError(self, encoderId, errorMessage)
			self.updateStatus(InstanceStatus.UnknownWarning, errorMessage)
			return
		} else {
			//we are ok
			self.updateStatus(InstanceStatus.Ok)
		}

		ClearEncoderError(self, encoderId)

		try {
			const scheduleIdLocation = response.headers.get('location')
			LogVerbose(self, `Schedule Id Location: ${scheduleIdLocation}`)
			//remove everything before the last slash
			if (scheduleIdLocation) {
				const parts = scheduleIdLocation.split('/')
				const scheduleId = parts[parts.length - 1]
				self.log('info', `Schedule ID: ${scheduleId}`)

				//store the encoder id and schedule id in an array for the instance
				let scheduleIdObj: Schedule = {
					encoderId: encoderId,
					scheduleId: scheduleId,
					scheduleIdLocation: scheduleIdLocation,
					destinationGroupId: destinationGroupId,
				}

				self.SCHEDULE_IDS.push(scheduleIdObj)

				//save to the config also
				self.config.SCHEDULE_IDS = self.SCHEDULE_IDS
				self.saveConfig(self.config)

				//now that we know the schedule ID, we can fetch the schedule on an interval, however the schedule will not be available immediately, so we will not fetch it here
				StartFastPollingSchedule(self, scheduleId)
			} else {
				self.log('error', 'Schedule ID is not available in the response headers.')
			}
		} catch (err) {
			self.log('error', `Error: ${err}`)
		}

		LogVerbose(self, `Response: ${response.status} ${response.statusText}`)
		self.log(
			'info',
			`Encoder "${encoderName}" (${encoderId}) with Destination Group "${destinationGroupName}" (${destinationGroupId}) started successfully`,
		)
	} catch (error: any) {
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to start Encoder - see log for details')
		LogVerbose(self, `Error: ${error.message || error}`)
		console.log(error)
	} finally {
		//GetSchedules(self)
	}
}

// --- Stop Live ---

export async function StopLive(self: ResiStudioInstance, encoderId: string, destinationGroupId: string): Promise<void> {
	if (await !CheckTokenExpiry(self)) return

	const encoderName = self.CHOICES_ENCODERS.find((encoder) => encoder.id === encoderId)?.label || 'Unknown Encoder'
	const destinationGroupName =
		self.CHOICES_DESTINATION_GROUPS.find((group) => group.id === destinationGroupId)?.label ||
		'Unknown Destination Group'

	try {
		//find the schedule object for the encoder ID
		const schedule = self.SCHEDULE_IDS.find(
			(s) => s.encoderId === encoderId && s.destinationGroupId === destinationGroupId,
		)
		if (!schedule) {
			const errorMessage = `Unable to Stop: No schedule found for Encoder "${encoderName}" (${encoderId}) with Destination Group "${destinationGroupName}" (${destinationGroupId})`
			self.log('error', errorMessage)

			AddEncoderError(self, encoderId, `Unable to Stop: No schedule found`)
			//self.updateStatus(InstanceStatus.UnknownWarning, errorMessage)
			return
		}

		LogVerbose(
			self,
			`Stopping Encoder "${encoderName}" (${encoderId}) with Destination Group "${destinationGroupName}" (${destinationGroupId})`,
		)

		const scheduleId = schedule.scheduleId

		LogVerbose(self, `Schedule ID: ${scheduleId}`)

		const apiStopEncoderUrl = `${API_BASE_URL}/${API_VERSION}/schedules/${scheduleId}/stop`
		LogVerbose(self, `Using API URL: ${apiStopEncoderUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiStopEncoderUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
		})

		logRequest(self)

		if (response.ok) {
			self.log(
				'info',
				`Encoder "${encoderName}" (${encoderId}) with Destination Group "${destinationGroupName}" (${destinationGroupId}) stopped successfully`,
			)
			//remove the schedule object from the array based on matching encoderId and destinationGroupId
			self.SCHEDULE_IDS = self.SCHEDULE_IDS.filter(
				(schedule) => schedule.encoderId !== encoderId && schedule.destinationGroupId !== destinationGroupId,
			)
			LogVerbose(self, `Response: ${response.status} ${response.statusText}`)
			self.log('info', `Removed Schedule ID ${scheduleId} from the list`)
			self.checkFeedbacks() // Check feedbacks after stopping the encoder
		} else {
			self.log(
				'error',
				`Failed to stop Encoder "${encoderName}" (${encoderId}) with Destination Group "${destinationGroupName}" (${destinationGroupId}): ${response.statusText}`,
			)

			const errorMessage = parseErrorResponse(self, response)
			self.log('error', errorMessage)
			const body = await response.text()
			LogVerbose(self, `Response body: ${body}`)
			throw new Error(errorMessage)
		}
	} catch (error: any) {
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to stop stream - see log for details')
	}
}

// --- Fetch Schedule ---

export async function GetSchedule(self: ResiStudioInstance, schedule: Schedule): Promise<void> {
	if (await !CheckTokenExpiry(self)) return
	try {
		const scheduleId = schedule.scheduleId
		const scheduleIdLocation = schedule.scheduleIdLocation

		LogVerbose(self, `Schedule ID Location: ${scheduleIdLocation}`)

		LogVerbose(self, `Schedule ID: ${scheduleId}`)

		const apiSchedulesUrl = `${API_BASE_URL}/${API_VERSION}/schedules/${scheduleId}`

		LogVerbose(self, `Retrieving Schedule from: ${apiSchedulesUrl}`)

		await waitUntilOkToRequest(self)

		const response = await fetch(apiSchedulesUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${self.TOKEN}`,
			},
		})

		logRequest(self)

		LogVerbose(self, `Response: ${response.status} ${response.statusText}`)
		if (!response.ok) {
			// Handle specific error codes
			if (response.status === 404) {
				self.log('error', `Schedule not found for Schedule Id ${scheduleId} - Does the Encoder have an input?`)
				//remove this schedule from the array as it is not valid anyway
				self.SCHEDULE_IDS = self.SCHEDULE_IDS.filter((s) => s.scheduleId !== scheduleId)
				return
			} else {
				self.log('error', `Failed to fetch schedules: ${response.statusText}`)
			}

			//self.updateStatus(InstanceStatus.UnknownWarning, 'Failed to fetch schedules - see log for details')
			return
		}

		const data = (await response.json()) as ScheduleResponse

		if (!data || !data.destinations || data.destinations.length === 0) {
			self.log('warn', `No Destinations found for Schedule Id ${scheduleId}`)
			return
		}
		const destinations = data.destinations.map((destination: ScheduleDestination) => ({
			id: destination.id,
			name: destination.name || 'Unknown Name', // Provide a default value for name if missing
			type: destination.type,
			status: destination.status,
		}))
		LogVerbose(self, `Retrieved Destinations data: ${JSON.stringify(destinations)}`)

		//save this destination data to the schedule object
		//look up by schedule ID
		const existingSchedule = self.SCHEDULE_IDS.find((schedule) => schedule.scheduleId === scheduleId)
		if (!existingSchedule) {
			self.log('error', `No schedule found for ID: ${scheduleId}`)
			return
		}
		//update the destinations for this schedule
		existingSchedule.destinations = destinations

		self.checkFeedbacks() // Check feedbacks after fetching schedules

		//if all destinations are STOPPED, remove the schedule from the array
		const allDestinationsStopped = destinations.every((destination) => destination.status === 'STOPPED')
		if (allDestinationsStopped) {
			self.log('info', `All destinations are STOPPED for Schedule Id ${scheduleId}`)
			//remove this schedule from the array as it is not valid anyway
			self.SCHEDULE_IDS = self.SCHEDULE_IDS.filter((s) => s.scheduleId !== scheduleId)
			self.log('info', `Removed Schedule Id ${scheduleId} from the list`)
			self.checkFeedbacks() // Check feedbacks after removing the schedule
		} else {
			LogVerbose(self, `Retrieved ${destinations.length} destinations for Schedule Id ${scheduleId}`)
		}

		//fetch info about each destination
		/*for (const destination of destinations) {
			await GetDestinationInfo(self, destination.id)
		}*/
	} catch (error: any) {
		self.log('error', `Failed to fetch schedules: ${error.message || error}`)
		self.updateStatus(InstanceStatus.ConnectionFailure, 'Failed to fetch schedules - see log for details')
	}
}

// --- Verbose Logging Helper ---

export function LogVerbose(self: ResiStudioInstance, message: string): void {
	if (self.config.verbose) {
		self.log('debug', message)
	}
}

// --- Error Handling ---

function parseErrorResponse(self: ResiStudioInstance, response: Response, body?: string): string {
	self.log('error', `Error: ${response.status} ${response.statusText}`)

	//log API url
	const apiUrl = response.url
	if (apiUrl) {
		self.log('debug', `API URL: ${apiUrl}`)
	}

	//log x-request-id header if it exists
	const requestId = response.headers.get('x-request-id')
	if (requestId) {
		self.log('debug', `x-request-id: ${requestId}`)
	}

	//log response body
	if (body) {
		self.log('debug', `Response body: ${body}`)
	}

	switch (response.status) {
		case 400:
			return 'Bad Request: Check your input values.'
		case 401:
			StopPolling(self) // Stop polling if unauthorized
			self.updateStatus(InstanceStatus.ConnectionFailure, 'Unauthorized - please re-authenticate')
			return 'Unauthorized: Check your API credentials.'
		case 403:
			return 'Forbidden: You may not have access to this resource.'
		case 404:
			return 'Not Found: The requested resource does not exist.'
		case 409:
			return 'Conflict: Encoder may already be live or there is an overlapping schedule.'
		case 429:
			return 'Too Many Requests: Rate limit exceeded. Please try again later.'
		case 520:
			return 'Error 520: The server encountered an unexpected condition.'
		default:
			return `Unexpected error: ${response.status} ${response.statusText}`
	}
}

function AddEncoderError(self: ResiStudioInstance, encoderId: string, errorMessage: string): void {
	if (!self.ENCODERS_WITH_ERRORS.some((error) => error.encoderId === encoderId)) {
		self.ENCODERS_WITH_ERRORS.push({ encoderId, errorMessage })
	} else {
		// If the error already exists, update the error message
		const existingError = self.ENCODERS_WITH_ERRORS.find((error) => error.encoderId === encoderId)
		if (existingError) {
			existingError.errorMessage = errorMessage
		}
	}
	self.checkFeedbacks() // Check feedbacks after adding the error

	const variableObj = {} as any
	variableObj.encoderErrorStatus = errorMessage
	self.setVariableValues(variableObj) // Set the variable value for the error message
}

function ClearEncoderError(self: ResiStudioInstance, encoderId: string): void {
	self.ENCODERS_WITH_ERRORS = self.ENCODERS_WITH_ERRORS.filter((error) => error.encoderId !== encoderId)
	self.checkFeedbacks() // Check feedbacks after clearing the error

	const variableObj = {} as any
	variableObj.encoderErrorStatus = ''
	self.setVariableValues(variableObj) // Set the variable value for the error message
}

const REQUEST_LIMIT = 10
const TIME_WINDOW_MS = 60_000 // 1 minute

export async function waitUntilOkToRequest(self: ResiStudioInstance): Promise<void> {
	if (!self.requestLog) {
		self.requestLog = []
	}

	while (true) {
		const now = Date.now()

		// Remove entries older than the window
		self.requestLog = self.requestLog.filter((timestamp) => now - timestamp < TIME_WINDOW_MS)

		if (self.requestLog.length < REQUEST_LIMIT) {
			LogVerbose(
				self,
				`Request allowed: ${self.requestLog.length} requests in the last ${TIME_WINDOW_MS / 1000} seconds`,
			)
			return
		}

		LogVerbose(
			self,
			`Request limit reached: ${self.requestLog.length} requests in the last ${TIME_WINDOW_MS / 1000} seconds`,
		)

		// Wait before checking again
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
}

export function logRequest(self: ResiStudioInstance): void {
	if (!self.requestLog) {
		self.requestLog = []
	}
	self.requestLog.push(Date.now())
}

function StartFastPollingSchedule(self: ResiStudioInstance, scheduleId: string): void {
	if (!self.FAST_POLLING) self.FAST_POLLING = {}
	if (self.FAST_POLLING[scheduleId]) return

	let retryCount = 0
	const maxRetries = 20
	const pollDelay = 3000

	async function pollOnce() {
		const schedule = self.SCHEDULE_IDS.find((s) => s.scheduleId === scheduleId)
		if (!schedule) {
			delete self.FAST_POLLING[scheduleId]
			return
		}

		retryCount++
		await GetSchedule(self, schedule)

		if ((schedule.destinations?.length ?? 0) > 0 && schedule.destinations?.every((d) => d.status === 'STARTED')) {
			self.log('info', `Schedule ${scheduleId} fully started. Stopping fast polling.`)
			delete self.FAST_POLLING[scheduleId]
			return
		}

		if (retryCount >= maxRetries) {
			self.log('warn', `Fast polling for Schedule ${scheduleId} timed out.`)
			delete self.FAST_POLLING[scheduleId]
			return
		}

		// Schedule next poll
		self.FAST_POLLING[scheduleId] = setTimeout(pollOnce, pollDelay)
	}

	self.FAST_POLLING[scheduleId] = setTimeout(pollOnce, pollDelay)
}
