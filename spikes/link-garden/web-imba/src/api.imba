# Hand-rolled HTTP client for the Typebase backend. Imba cannot consume the
# generated TypeScript client, so this layer is the measured cost of the
# spike: every call is POST JSON to /rpc/<module>/<action>, with the input
# wrapped as {"json": ...} per oRPC's transport, and results unwrapped.
# Same-origin via the vite dev proxy — the bundle's better-auth breaks on
# CORS preflights (404) and rejects non-JSON content types (415).
const API_URL = ''

def authPost path, payload
	const response = await fetch(API_URL + '/api/auth/' + path, {
		method: 'POST'
		headers: { 'content-type': 'application/json' }
		credentials: 'include'
		body: JSON.stringify(payload)
	})

	if response.ok
		return await response.json!

	# optional chaining (?.) compiles broken in this fork — plain ifs only
	var message = null
	var code = null
	try
		const parsed = await response.json!
		message = parsed.message
		code = parsed.code
	catch
		null

	if message
		throw new Error(message)
	if code
		throw new Error(code)
	throw new Error('auth failed')

export def signUp name, email, password
	await authPost('sign-up/email', {name: name, email: email, password: password})

export def signIn email, password
	await authPost('sign-in/email', {email: email, password: password})

export def getSessionUser
	try
		const response = await fetch(API_URL + '/api/auth/get-session', {credentials: 'include'})
		const data = await response.json!
		if data and data.user
			return data.user
		return null
	catch err
		console.error 'getSessionUser failed', err
		return null

export def rpc action, input
	const response = await fetch(API_URL + '/rpc/' + action, {
		method: 'POST'
		headers: { 'content-type': 'application/json' }
		credentials: 'include'
		body: JSON.stringify({json: input or {}})
	})

	const body = await response.json!
	var payload = null
	if body
		payload = body.json

	if response.ok
		return payload

	var message = null
	var code = null
	if payload
		message = payload.message
		code = payload.code

	if message
		throw new Error(message)
	if code
		throw new Error(code)
	throw new Error('rpc ' + action + ' failed')

export def createLink url, tags
	await rpc('links/create', {url: url, tags: tags})

export def listLinks
	await rpc('links/list', {})

export def setStatus id, status
	await rpc('links/setStatus', {id: id, status: status})

export def addTag id, name
	await rpc('links/addTag', {id: id, name: name})

export def todayStats
	await rpc('stats/today', {})
