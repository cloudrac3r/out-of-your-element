const {test} = require("supertape")
const {path} = require("./api")

test("api path: no change for plain path", t => {
	t.equal(path("/hello/world"), "/hello/world")
})

test("api path: add mxid to the URL", t => {
	t.equal(path("/hello/world", "12345"), "/hello/world?user_id=12345")
})

test("api path: empty path with mxid", t => {
	t.equal(path("", "12345"), "/?user_id=12345")
})

test("api path: existing query parameters with mxid", t => {
	t.equal(path("/hello/world?foo=bar&baz=qux", "12345"), "/hello/world?foo=bar&baz=qux&user_id=12345")
})

test("api path: real world mxid", t => {
	t.equal(path("/hello/world", "@cookie_monster:cadence.moe"), "/hello/world?user_id=%40cookie_monster%3Acadence.moe")
})

test("api path: extras number works", t => {
	t.equal(path(`/client/v3/rooms/!example/timestamp_to_event`, null, {ts: 1687324651120}), "/client/v3/rooms/!example/timestamp_to_event?ts=1687324651120")
})

test("api path: multiple via params", t => {
	t.equal(path(`/client/v3/rooms/!example/join`, null, {via: ["cadence.moe", "matrix.org"], ts: 1687324651120}), "/client/v3/rooms/!example/join?via=cadence.moe&via=matrix.org&ts=1687324651120")
})
