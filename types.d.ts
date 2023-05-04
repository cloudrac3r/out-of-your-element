export type AppServiceRegistrationConfig = {
	id: string
	as_token: string
	hs_token: string
	url: string
	sender_localpart: string
	protocols: [string]
	rate_limited: boolean
}

export type M_Room_Message_content = {
	msgtype: "m.text"
	body: string
	formatted_body?: "org.matrix.custom.html"
	format?: string
}

export type R_RoomCreated = {
	room_id: string
}

export type R_FileUploaded = {
	content_uri: string
}
