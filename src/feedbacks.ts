import { CompanionFeedbackDefinitions, combineRgb } from '@companion-module/base'
import type { ResiStudioInstance } from './main.js'

export function UpdateFeedbacks(self: ResiStudioInstance): void {
	const feedbacks: CompanionFeedbackDefinitions = {}

	feedbacks.destinationStatus = {
		name: 'Show Go Live Status for All Destinations',
		description: 'If all destinations for the encoder match the selected state, show the feedback',
		type: 'boolean',
		options: [
			{
				type: 'dropdown',
				label: 'Encoder',
				id: 'encoder',
				default: self.CHOICES_ENCODERS[0].id,
				choices: self.CHOICES_ENCODERS,
			},
			{
				type: 'dropdown',
				label: 'Destination Group',
				id: 'destinationGroup',
				default: self.CHOICES_DESTINATION_GROUPS[0].id,
				choices: self.CHOICES_DESTINATION_GROUPS,
			},
			{
				type: 'dropdown',
				label: 'State',
				id: 'state',
				default: 'STARTED',
				choices: [
					{ id: 'SET_UP', label: 'Setting Up' },
					{ id: 'STARTING', label: 'Starting' },
					{ id: 'STARTED', label: 'Started' },
					{ id: 'ABORTED', label: 'Aborted' },
				],
			},
		],
		defaultStyle: {
			color: combineRgb(255, 255, 255), // White text
			bgcolor: combineRgb(0, 255, 0), // Green background
		},
		callback: (feedback) => {
			const encoderId = feedback.options.encoder?.toString() || self.CHOICES_ENCODERS[0].id
			const destinationGroupId = feedback.options.destinationGroup?.toString() || self.CHOICES_DESTINATION_GROUPS[0].id
			const schedule = self.SCHEDULE_IDS.find(
				(s) => s.encoderId === encoderId && s.destinationGroupId === destinationGroupId,
			)
			if (schedule) {
				const allDestinationsStarted = schedule.destinations?.every(
					(destination) => destination.status === feedback.options.state,
				)
				return allDestinationsStarted ?? false
			}
			// If encoder not found, return false
			return false
		},
	}

	feedbacks.notifyEncoderError = {
		name: 'Show Encoder Error Notification',
		description: 'If there is an error with the Encoder, show the feedback',
		type: 'boolean',
		options: [
			{
				type: 'dropdown',
				label: 'Encoder',
				id: 'encoder',
				default: self.CHOICES_ENCODERS[0].id,
				choices: self.CHOICES_ENCODERS,
			},
		],
		defaultStyle: {
			color: combineRgb(255, 255, 255), // White text
			bgcolor: combineRgb(255, 0, 0), // Red background
		},
		callback: (feedback) => {
			// Check if there is an error related to the selected encoder
			const encoderId = feedback.options.encoder?.toString()
			if (encoderId) {
				const encoderError = self.ENCODERS_WITH_ERRORS.find((error) => error.encoderId === encoderId)
				if (encoderError) {
					return true // Show feedback if there is an error
				}
			}
			return false
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
