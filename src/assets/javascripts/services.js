window.browser = window.browser || window.chrome

import utils from "./utils.js"

let config, options, targets

function init() {
	return new Promise(async resolve => {
		browser.storage.local.get(["options", "targets", "embedTabs"], r => {
			options = r.options
			targets = r.targets
			embedTabs = r.embedTabs
			fetch("/config.json")
				.then(response => response.text())
				.then(configData => {
					config = JSON.parse(configData)
					resolve()
				})
		})
	})
}

init()
browser.storage.onChanged.addListener(init)

function all(service, frontend, options, config) {
	let instances = []
	if (!frontend) {
		for (const frontend in config.services[service].frontends) {
			if (options[frontend]) {
				instances.push(...options[frontend])
			}
		}
	} else {
		instances.push(...options[frontend])
	}
	return instances
}

function regexArray(service, url, config, frontend) {
	if (config.services[service].targets == "datajson") {
		for (const instance of targets[service]) {
			if (instance.startsWith(utils.protocolHost(url))) return true
		}
	} else {
		let targetList = config.services[service].targets
		if (frontend && config.services[service].frontends[frontend].excludeTargets)
			for (const i in config.services[service].frontends[frontend].excludeTargets) {
				targetList = targetList.splice(i, 1)
			}
		for (const targetString in targetList) {
			const target = new RegExp(targetList[targetString])
			if (target.test(url.href)) return true
		}
	}
	return false
}

let embedTabs = {}
function redirect(url, type, initiator, forceRedirection, tabId) {
	if (type != "main_frame" && type != "sub_frame" && type != "image") return
	let randomInstance
	let frontend
	for (const service in config.services) {
		if (!forceRedirection && !options[service].enabled) continue

		if (config.services[service].embeddable && type != options[service].redirectType && options[service].redirectType != "both") continue
		if (!config.services[service].embeddable && type != "main_frame") continue

		frontend = options[service].frontend ?? Object.keys(config.services[service].frontends)[0]

		if (!regexArray(service, url, config, frontend)) continue

		if (initiator && all(service, null, options, config).includes(initiator.origin)) return "BYPASSTAB"

		let instanceList = []
		for (const network in options[frontend]) {
			instanceList.push(...options[frontend])
		}
		if (instanceList.length === 0) return

		if ((type == "sub_frame" || type == "image") && embedTabs[tabId] && embedTabs[tabId][frontend] !== undefined) {
			randomInstance = embedTabs[tabId][frontend]
		} else {
			randomInstance = utils.getRandomInstance(instanceList)
		}

		if ((type == "sub_frame" || type == "image") && embedTabs[tabId] === undefined) {
			embedTabs[tabId] = {}
			embedTabs[tabId][frontend] = randomInstance
			browser.storage.local.set(embedTabs)
		}

		break
	}
	if (!frontend || !randomInstance) return

	// Here is a (temperory) space for defining constants required in 2 or more switch cases.
	const mapCentreRegex = /@(-?\d[0-9.]*),(-?\d[0-9.]*),(\d{1,2})[.z]/
	const dataLatLngRegex = /!3d(-?[0-9]{1,}.[0-9]{1,})!4d(-?[0-9]{1,}.[0-9]{1,})/
	const placeRegex = /\/place\/(.*)\//
	function convertMapCentre() {
		let [lat, lon, zoom] = [null, null, null]
		if (url.pathname.match(mapCentreRegex)) {
			// Set map centre if present
			;[lat, lon, zoom] = url.pathname.match(mapCentreRegex)
		} else if (url.searchParams.has("center")) {
			;[lat, lon] = url.searchParams.get("center").split(",")
			zoom = url.searchParams.get("zoom") ?? "17"
		}
		return [zoom, lon, lat]
	}
	switch (frontend) {
		// This is where all instance-specific code must be ran to convert the service url to one that can be understood by the frontend.
		case "beatbump":
			return `${randomInstance}${url.pathname}${url.search}`
				.replace("/watch?v=", "/listen?id=")
				.replace("/channel/", "/artist/")
				.replace("/playlist?list=", "/playlist/VL")
				.replace(/\/search\?q=.*/, searchQuery => searchQuery.replace("?q=", "/") + "?filter=all")
		case "hyperpipe":
			return `${randomInstance}${url.pathname}${url.search}`.replace(/\/search\?q=.*/, searchQuery => searchQuery.replace("?q=", "/"))
		case "bibliogram":
			const reservedPaths = ["u", "p", "privacy"]
			if (url.pathname === "/" || reservedPaths.includes(url.pathname.split("/")[1])) return `${randomInstance}${url.pathname}${url.search}`
			if (url.pathname.startsWith("/reel")) return `${randomInstance}${url.pathname}`
			if (url.pathname.startsWith("/tv")) return `${randomInstance}/p${url.pathname.replace(/\/tv/i, "")}${url.search}`
			else return `${randomInstance}/u${url.pathname}${url.search}` // Likely a user profile, redirect to '/u/...'
		case "lbryDesktop":
			return url.href.replace(/^https?:\/{2}odysee\.com\//, "lbry://").replace(/:(?=[a-zA-Z0-9])/g, "#")
		case "searx":
		case "searxng":
			return `${randomInstance}/${url.search}`
		case "whoogle":
			return `${randomInstance}/search${url.search}`
		case "librex":
			return `${randomInstance}/search.php${url.search}`
		case "send":
			return randomInstance
		case "nitter":
			let search = new URLSearchParams(url.search)

			search.delete("ref_src")
			search.delete("ref_url")

			search = search.toString()
			if (search !== "") search = `?${search}`

			if (url.host.split(".")[0] === "pbs" || url.host.split(".")[0] === "video") {
				try {
					const [, id, format, extra] = search.match(/(.*)\?format=(.*)&(.*)/)
					const query = encodeURIComponent(`${id}.${format}?${extra}`)
					return `${randomInstance}/pic${url.pathname}${query}`
				} catch {
					return `${randomInstance}/pic${url.pathname}${search}`
				}
			}

			if (url.pathname.split("/").includes("tweets")) return `${randomInstance}${url.pathname.replace("/tweets", "")}${search}`
			if (url.host == "t.co") return `${randomInstance}/t.co${url.pathname}`
			return `${randomInstance}${url.pathname}${search}#m`
		case "yattee":
			return url.href.replace(/^https?:\/{2}/, "yattee://")
		case "freetube":
			return `freetube://https://youtu.be${url.pathname}${url.search}`.replace(/watch\?v=/, "")
		case "simplyTranslate":
			return `${randomInstance}/${url.search}`
		case "libreTranslate":
			return `${randomInstance}/${url.search}`
				.replace(/(?<=\/?)sl/, "source")
				.replace(/(?<=&)tl/, "target")
				.replace(/(?<=&)text/, "q")
		case "osm": {
			if (initiator && initiator.host === "earth.google.com") return
			const travelModes = {
				driving: "fossgis_osrm_car",
				walking: "fossgis_osrm_foot",
				bicycling: "fossgis_osrm_bike",
				transit: "fossgis_osrm_car", // not implemented on OSM, default to car.
			}

			function addressToLatLng(address) {
				const xmlhttp = new XMLHttpRequest()
				xmlhttp.timeout = 5000
				http.ontimeout = () => {
					return
				}
				http.onerror = () => {
					return
				}
				xmlhttp.send()
				http.onreadystatechange = () => {
					if (xmlhttp.status === 200) {
						const json = JSON.parse(xmlhttp.responseText)[0]
						if (json) {
							return [`${json.lat},${json.lon}`, `${json.boundingbox[2]},${json.boundingbox[1]},${json.boundingbox[3]},${json.boundingbox[0]}`]
						}
					}
					console.info("Error: Status is " + xmlhttp.status)
				}
				xmlhttp.open("GET", `https://nominatim.openstreetmap.org/search/${address}?format=json&limit=1`, false)
			}

			let mapCentre = "#"
			let prefs = {}

			const mapCentreData = convertMapCentre()
			if (mapCentreData[0] && mapCentreData[1] && mapCentreData[2]) mapCentre = `#map=${mapCentreData[0]}/${mapCentreData[1]}/${mapCentreData[2]}`
			if (url.searchParams.get("layer")) prefs.layers = osmLayers[url.searchParams.get("layer")]

			if (url.pathname.includes("/embed")) {
				// Handle Google Maps Embed API
				// https://www.google.com/maps/embed/v1/place?key=AIzaSyD4iE2xVSpkLLOXoyqT-RuPwURN3ddScAI&q=Eiffel+Tower,Paris+France
				//console.log("embed life")

				let query = ""
				if (url.searchParams.has("q")) query = url.searchParams.get("q")
				else if (url.searchParams.has("query")) query = url.searchParams.has("query")
				else if (url.searchParams.has("pb"))
					try {
						query = url.searchParams.get("pb").split(/!2s(.*?)!/)[1]
					} catch (error) {
						console.error(error)
					} // Unable to find map marker in URL.

				let [coords, boundingbox] = addressToLatLng(query)
				prefs.bbox = boundingbox
				prefs.marker = coords
				prefs.layer = "mapnik"
				let prefsEncoded = new URLSearchParams(prefs).toString()
				return `${randomInstance}/export/embed.html?${prefsEncoded}`
			} else if (url.pathname.includes("/dir")) {
				// Handle Google Maps Directions
				// https://www.google.com/maps/dir/?api=1&origin=Space+Needle+Seattle+WA&destination=Pike+Place+Market+Seattle+WA&travelmode=bicycling

				let travMod = url.searchParams.get("travelmode")
				if (url.searchParams.has("travelmode")) prefs.engine = travelModes[travMod]

				let orgVal = url.searchParams.get("origin")
				let destVal = url.searchParams.get("destination")

				let org = addressToLatLng(orgVal)
				let dest = addressToLatLng(destVal)
				prefs.route = `${org};${dest}`

				let prefsEncoded = new URLSearchParams(prefs).toString()
				return `${randomInstance}/directions?${prefsEncoded}${mapCentre}`
			} else if (url.pathname.includes("data=") && url.pathname.match(dataLatLngRegex)) {
				// Get marker from data attribute
				// https://www.google.com/maps/place/41%C2%B001'58.2%22N+40%C2%B029'18.2%22E/@41.032833,40.4862063,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0xf64286eaf72fc49d!7e2!8m2!3d41.0328329!4d40.4883948
				//console.log("data life")

				let [, mlat, mlon] = url.pathname.match(dataLatLngRegex)

				return `${randomInstance}/search?query=${mlat}%2C${mlon}`
			} else if (url.searchParams.has("ll")) {
				// Get marker from ll param
				// https://maps.google.com/?ll=38.882147,-76.99017
				//console.log("ll life")

				const [mlat, mlon] = url.searchParams.get("ll").split(",")

				return `${randomInstance}/search?query=${mlat}%2C${mlon}`
			} else if (url.searchParams.has("viewpoint")) {
				// Get marker from viewpoint param.
				// https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=48.857832,2.295226&heading=-45&pitch=38&fov=80
				//console.log("viewpoint life")

				const [mlat, mlon] = url.searchParams.get("viewpoint").split(",")

				return `${randomInstance}/search?query=${mlat}%2C${mlon}`
			} else {
				// Use query as search if present.
				//console.log("normal life")

				let query
				if (url.searchParams.has("q")) query = url.searchParams.get("q")
				else if (url.searchParams.has("query")) query = url.searchParams.get("query")
				else if (url.pathname.match(placeRegex)) query = url.pathname.match(placeRegex)[1]

				let prefsEncoded = new URLSearchParams(prefs).toString()
				if (query) return `${randomInstance}/search?query="${query}${mapCentre}&${prefsEncoded}`
			}

			let prefsEncoded = new URLSearchParams(prefs).toString()
			// console.log("mapCentre", mapCentre)
			// console.log("prefs", prefs)
			// console.log("prefsEncoded", prefsEncoded)
			return `${randomInstance}/${mapCentre}&${prefsEncoded}`
		}
		case "facil": {
			if (initiator && initiator.host === "earth.google.com") return
			const travelModes = {
				driving: "car",
				walking: "pedestrian",
				bicycling: "bicycle",
				transit: "car", // not implemented on Facil, default to car.
			}
			const mapCentreData = convertMapCentre()
			let mapCentre = "#"
			if (mapCentreData[0] && mapCentreData[1] && mapCentreData[2]) mapCentre = `#${mapCentreData[0]}/${mapCentreData[1]}/${mapCentreData[2]}`

			if (url.pathname.includes("/embed")) {
				// Handle Google Maps Embed API
				// https://www.google.com/maps/embed/v1/place?key=AIzaSyD4iE2xVSpkLLOXoyqT-RuPwURN3ddScAI&q=Eiffel+Tower,Paris+France
				//console.log("embed life")

				let query = ""
				if (url.searchParams.has("q")) query = url.searchParams.get("q")
				else if (url.searchParams.has("query")) query = url.searchParams.has("query")
				else if (url.searchParams.has("pb"))
					try {
						query = url.searchParams.get("pb").split(/!2s(.*?)!/)[1]
					} catch (error) {
						console.error(error)
					} // Unable to find map marker in URL.

				return `${randomInstance}/#q=${query}`
			} else if (url.pathname.includes("/dir")) {
				// Handle Google Maps Directions
				// https://www.google.com/maps/dir/?api=1&origin=Space+Needle+Seattle+WA&destination=Pike+Place+Market+Seattle+WA&travelmode=bicycling

				let travMod = url.searchParams.get("travelmode")

				let orgVal = url.searchParams.get("origin")
				let destVal = url.searchParams.get("destination")

				return `${randomInstance}/#q=${orgVal}%20to%20${destVal}%20by%20${travelModes[travMod]}`
			} else if (url.pathname.includes("data=") && url.pathname.match(dataLatLngRegex)) {
				// Get marker from data attribute
				// https://www.google.com/maps/place/41%C2%B001'58.2%22N+40%C2%B029'18.2%22E/@41.032833,40.4862063,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0xf64286eaf72fc49d!7e2!8m2!3d41.0328329!4d40.4883948
				//console.log("data life")

				let [, mlat, mlon] = url.pathname.match(dataLatLngRegex)

				return `${randomInstance}/#q=${mlat}%2C${mlon}`
			} else if (url.searchParams.has("ll")) {
				// Get marker from ll param
				// https://maps.google.com/?ll=38.882147,-76.99017
				//console.log("ll life")

				const [mlat, mlon] = url.searchParams.get("ll").split(",")

				return `${randomInstance}/#q=${mlat}%2C${mlon}`
			} else if (url.searchParams.has("viewpoint")) {
				// Get marker from viewpoint param.
				// https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=48.857832,2.295226&heading=-45&pitch=38&fov=80
				//console.log("viewpoint life")

				const [mlat, mlon] = url.searchParams.get("viewpoint").split(",")

				return `${randomInstance}/#q=${mlat}%2C${mlon}`
			} else {
				// Use query as search if present.
				//console.log("normal life")

				let query
				if (url.searchParams.has("q")) query = url.searchParams.get("q")
				else if (url.searchParams.has("query")) query = url.searchParams.get("query")
				else if (url.pathname.match(placeRegex)) query = url.pathname.match(placeRegex)[1]

				if (query) return `${randomInstance}/${mapCentre}/Mpnk/${query}`
			}
		}
		case "lingva":
			let params_arr = url.search.split("&")
			params_arr[0] = params_arr[0].substring(1)
			let params = {}
			for (let i = 0; i < params_arr.length; i++) {
				let pair = params_arr[i].split("=")
				params[pair[0]] = pair[1]
			}
			if (params.sl && params.tl && params.text) {
				return `${randomInstance}/${params.sl}/${params.tl}/${params.text}`
			}
			return randomInstance
		case "breezeWiki":
			let wiki,
				urlpath = ""
			if (url.hostname.match(/^[a-zA-Z0-9-]+\.fandom\.com/)) {
				wiki = url.hostname.match(/^[a-zA-Z0-9-]+(?=\.fandom\.com)/)
				if (wiki == "www" || !wiki) wiki = ""
				else wiki = `/${wiki}`;
				urlpath = url.pathname
			} else {
				wiki = url.pathname.match(/(?<=wiki\/w:c:)[a-zA-Z0-9-]+(?=:)/)
				if (!wiki) wiki = ""
				else {
					wiki = "/" + wiki + "/wiki/"
					urlpath = url.pathname.match(/(?<=wiki\/w:c:[a-zA-Z0-9-]+:).+/)
				}
			}
			if (url.href.search(/Special:Search\?query/) > -1) return `${randomInstance}${wiki}${urlpath}${url.search}`.replace(/Special:Search\?query/, "search?q").replace(/\/wiki/, "")
			else return `${randomInstance}${wiki}${urlpath}${url.search}`
		case "rimgo":
			if (url.href.search(/^https?:\/{2}(?:[im]\.)?stack\./) > -1) return `${randomInstance}/stack${url.pathname}${url.search}`
			else return `${randomInstance}${url.pathname}${url.search}`
		case "libreddit":
			const subdomain = url.hostname.match(/^(?:(?:external-)?preview|i)(?=\.redd\.it)/)
			if (!subdomain) return `${randomInstance}${url.pathname}${url.search}`
			switch (subdomain[0]) {
				case "preview":
					return `${randomInstance}/preview/pre${url.pathname}${url.search}`
				case "external-preview":
					return `${randomInstance}/preview/external-pre${url.pathname}${url.search}`
				case "i":
					return `${randomInstance}/img${url.pathname}`
			}
		case "teddit":
			if (/^(?:(?:external-)?preview|i)\.redd\.it/.test(url.hostname)) {
				if (url.search == "") return `${randomInstance}${url.pathname}?teddit_proxy=${url.hostname}`
				else return `${randomInstance}${url.pathname}${url.search}&teddit_proxy=${url.hostname}`
			}
			return `${randomInstance}${url.pathname}${url.search}`
		default:
			return `${randomInstance}${url.pathname}${url.search} `
	}
}

function computeService(url, returnFrontend) {
	return new Promise(resolve => {
		fetch("/config.json")
			.then(response => response.text())
			.then(configData => {
				const config = JSON.parse(configData)
				browser.storage.local.get(["redirects", "options"], r => {
					const options = r.options
					for (const service in config.services) {
						if (regexArray(service, url, config)) {
							resolve(service)
							return
						} else {
							for (const frontend in config.services[service].frontends) {
								if (all(service, frontend, options, config).includes(utils.protocolHost(url))) {
									if (returnFrontend) resolve([service, frontend, utils.protocolHost(url)])
									else resolve(service)
									return
								}
							}
						}
					}
					resolve()
				})
			})
	})
}

function switchInstance(url) {
	return new Promise(async resolve => {
		await init()
		const protocolHost = utils.protocolHost(url)
		for (const service in config.services) {
			if (!all(service, null, options, config).includes(protocolHost)) continue

			let instancesList = []
			if (Object.keys(config.services[service].frontends).length == 1) {
				const frontend = Object.keys(config.services[service].frontends)[0]
				for (const network in options[frontend]) {
					instancesList.push(...options[frontend])
				}
			} else {
				const frontend = options[service].frontend
				for (const network in options[frontend]) {
					instancesList.push(...options[frontend])
				}
			}

			let oldInstance
			const i = instancesList.indexOf(protocolHost)
			if (i > -1) {
				oldInstance = instancesList[i]
				instancesList.splice(i, 1)
			}
			if (instancesList.length === 0) {
				resolve()
				return
			}
			const randomInstance = utils.getRandomInstance(instancesList)
			const oldUrl = `${oldInstance}${url.pathname}${url.search} `
			// This is to make instance switching work when the instance depends on the pathname, eg https://darmarit.org/searx
			// Doesn't work because of .includes array method, not a top priotiry atm
			resolve(oldUrl.replace(oldInstance, randomInstance))
			return
		}
		resolve()
	})
}

function reverse(url, urlString) {
	return new Promise(async resolve => {
		await init()
		let protocolHost
		if (!urlString) protocolHost = utils.protocolHost(url)
		else protocolHost = url.match(/https?:\/{2}(?:[^\s\/]+\.)+[a-zA-Z0-9]+/)[0]
		for (const service in config.services) {
			if (!all(service, null, options, config).includes(protocolHost)) continue

			switch (service) {
				case "instagram":
				case "youtube":
				case "imdb":
				case "imgur":
				case "tiktok":
				case "twitter":
				case "reddit":
				case "imdb":
				case "quora":
				case "medium":
				case "fandom":
					let regex = url.pathname.match(/^\/([a-zA-Z0-9-]+)\/wiki\/([a-zA-Z0-9-]+)/)
					if (regex) {
						resolve(`https://${regex[1]}.fandom.com/wiki/${regex[2]}`)
						return
					}
					resolve()
					return
				default:
					resolve()
					return
			}
		}
		resolve()
	})
}

function initDefaults() {
	return new Promise(resolve => {
		fetch("/config.json")
			.then(response => response.text())
			.then(configData => {
				browser.storage.local.get(["options"], r => {
					let options = r.options
					let targets = {}
					let config = JSON.parse(configData)
					const localstorage = {}
					for (const service in config.services) {
						options[service] = {}
						for (const defaultOption in config.services[service].options) {
							options[service][defaultOption] = config.services[service].options[defaultOption]
						}
						for (const frontend in config.services[service].frontends) {
							if (config.services[service].frontends[frontend].instanceList) {
								options[frontend] = []
							}
						}
					}
					browser.storage.local.set(
						{ options, targets, localstorage, embedTabs: {} },
						() => resolve()
					)
				})
			})
	})
}

function upgradeOptions() {
	return new Promise(resolve => {
		fetch("/config.json")
			.then(response => response.text())
			.then(configData => {
				browser.storage.local.get(null, r => {
					let options = r.options
					const config = JSON.parse(configData)
					options.exceptions = r.exceptions
					if (r.theme != "DEFAULT") options.theme = r.theme
					options.popupServices = r.popupFrontends
					let tmp = options.popupServices.indexOf("tikTok")
					if (tmp > -1) {
						options.popupServices.splice(tmp, 1)
						options.popupServices.push("tiktok")
					}
					tmp = options.popupServices.indexOf("sendTarget")
					if (tmp > -1) {
						options.popupServices.splice(tmp, 1)
						options.popupServices.push("sendFiles")
					}
					switch (r.onlyEmbeddedVideo) {
						case "onlyNotEmbedded":
							options.youtube.redirectType = "main_frame"
						case "onlyEmbedded":
							options.youtube.redirectType = "sub_frame"
						case "both":
							options.youtube.redirectType = "both"
					}
					for (const service in config.services) {
						let oldService
						switch (service) {
							case "tiktok":
								oldService = "tikTok"
								break
							case "sendFiles":
								oldService = "sendTarget"
								break
							default:
								oldService = service
						}
						options[service].enabled = !r["disable" + utils.camelCase(oldService)]
						if (r[oldService + "Frontend"]) {
							if (r[oldService + "Frontend"] == "yatte") options[service].frontend = "yattee"
							else options[service].frontend = r[oldService + "Frontend"]
						}
						if (r[oldService + "RedirectType"]) options[service].redirectType = r[oldService + "RedirectType"]
						for (const frontend in config.services[service].frontends) {
							for (const network in config.networks) {
								let protocol
								if (network == "clearnet") protocol = "normal"
								else protocol = network
							}
						}
					}
					browser.storage.local.set({ options }, () => resolve())
				})
			})
	})
}

function processUpdate() {
	return new Promise(resolve => {
		fetch("/instances/data.json")
			.then(response => response.text())
			.then(data => {
				fetch("/config.json")
					.then(response => response.text())
					.then(configData => {
						browser.storage.local.get(["options", "targets"], async r => {
							let redirects = JSON.parse(data)
							let options = r.options
							let targets = r.targets
							let config = JSON.parse(configData)
							for (const service in config.services) {
								if (!options[service]) options[service] = {}
								if (config.services[service].targets == "datajson") {
									targets[service] = redirects[service]
									delete redirects[service]
								}
								for (const defaultOption in config.services[service].options) {
									if (options[service][defaultOption] === undefined) {
										options[service][defaultOption] = config.services[service].options[defaultOption]
									}
								}
								for (const frontend in config.services[service].frontends) {
									if (config.services[service].frontends[frontend].instanceList) {
										if (!options[frontend]) options[frontend] = {}
										for (const network in config.networks) {
											if (!options[frontend]) {
												options[frontend] = []
												if (network == "clearnet") {
													for (const blacklist of await utils.getBlacklist()) {
														for (const instance of blacklist) {
															let i = options[frontend].clearnet.enabled.indexOf(instance)
															if (i > -1) options[frontend].clearnet.enabled.splice(i, 1)
														}
													}
												}
											}
										}
									}
								}
							}
							browser.storage.local.set({ redirects, options, targets })
							resolve()
						})
					})
			})
	})
}

// For websites that have a strict policy that would not normally allow these frontends to be embedded within the website.
function modifyContentSecurityPolicy(details) {
	let isChanged = false
	if (details.type == "main_frame") {
		for (const header in details.responseHeaders) {
			if (details.responseHeaders[header].name == "content-security-policy") {
				let instancesList = []
				for (const service in config.services) {
					if (config.services[service].embeddable) {
						for (const frontend in config.services[service].frontends) {
							if (config.services[service].frontends[frontend].embeddable) {
								for (const network in config.networks) {
									instancesList.push(...options[frontend])
								}
							}
						}
					}
				}
				let securityPolicyList = details.responseHeaders[header].value.split(";")
				for (const i in securityPolicyList) securityPolicyList[i] = securityPolicyList[i].trim()
				let newSecurity = ""
				for (const item of securityPolicyList) {
					if (item.trim() == "") continue
					let regex = item.match(/([a-z-]{0,}) (.*)/)
					if (regex == null) continue
					let [, key, vals] = regex
					if (key == "frame-src") vals = vals + " " + instancesList.join(" ")
					newSecurity += key + " " + vals + "; "
				}

				details.responseHeaders[header].value = newSecurity
				isChanged = true
			}
		}
		if (isChanged) return { responseHeaders: details.responseHeaders }
	}
}

export default {
	redirect,
	computeService,
	switchInstance,
	reverse,
	initDefaults,
	upgradeOptions,
	processUpdate,
	modifyContentSecurityPolicy,
}
