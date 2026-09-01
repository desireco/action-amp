# Pure helpers — no state, no I/O.

export def hostOf url
	try
		return new URL(url).host
	catch
		return url

export def parseCapture text
	const parts = text.trim().split(/\s+/).filter do |p| p.length > 0
	const tags = parts.filter(do |p| p.startsWith('#')).map(do |p| p.slice(1))
	const url = parts.find(do |p| not p.startsWith('#')) or ''
	return { url: url, tags: tags }

export def isValidUrl url
	/^https?:\/\//.test(url)
