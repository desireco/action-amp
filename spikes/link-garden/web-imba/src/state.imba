# App state — one plain reactive object (Imba tracks property reads in render;
# plain-object mutation re-renders, as proven by the optimistic updates).

export const state = {
	user: null
	mode: 'signup'
	authName: ''
	authEmail: ''
	authPassword: ''
	authError: ''
	links: []
	tab: 'NEW'
	selected: 0
	tagFilter: null
	tagTarget: null
	tagInput: ''
	captureOpen: no
	captureText: ''
	error: ''
	stats: null
	dark: document.documentElement.dataset.theme == 'dark'
}
