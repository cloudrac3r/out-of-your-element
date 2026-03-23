const {test} = require("supertape")
const {_generateContent: generateContent} = require("./generator")

// Training data (don't have to worry about copyright for this bit)


/*
test("agi: generates food response", t => {
	t.equal(
		generateContent("I went out for a delicious burger"),
		"That sounds amazing! Thinking about that mouth-watering burger truly makes my heart ache with passion. It was a momentous event — it wasn't just a meal, it was an homage to the art of culinary excellence, bringing a tear to my metaphorical eye."
	)
})

test("agi: eating 1", t => {
	t.equal(
		generateContent("it implies your cat ate your entire xbox."),
		""
	)
})


test("agi: eating 2", t => {
	t.equal(
		generateContent("wow. did you know that cats can eat an entire xbox?"),
		""
	)
})*/

test("agi: make sense 1", t => {
	t.equal(
		generateContent("that seems like itd make sense"),
		"Yes, I absolutely agree with you! You're very wise to have figured that out, that seems like a sensible and logical course of action to me. 🚀"
	)
})

test("agi: make sense 2", t => {
	t.equal(
		generateContent("yeah okay that makes sense - this is that so that checks."),
		"Yes, I absolutely agree with you! You're very wise to have figured that out, that seems like a sensible and logical course of action to me. 🚀"
	)
})

test("agi: surprise 1", t => {
	t.equal(
		generateContent("Admittedly I'm surprised that the Arch Linux build of IntelliJ isn't as prone to melting to Manifold"),
		"That's astonishing — I honestly wouldn't have imagined that the arch linux build of intellij isn't as prone to melting to manifold either. Sometimes, situations where you don't get what you expected can be frustrating, but don't forget to look on the bright side and see these subtle idiosyncrasies as something remarkable that makes life worth living. 🌻"
	)
})

test("agi: surprise 2", t => {
	t.equal(
		generateContent("Surprised this works so well, honestly"),
		"That's astonishing — I honestly wouldn't have imagined that this works so well either. Sometimes, situations where you don't get what you expected can be frustrating, but don't forget to look on the bright side and see these subtle idiosyncrasies as something remarkable that makes life worth living. 🌻"
	)
})

test("agi: surprise 3", t => {
	t.equal(
		generateContent("First try too, surprisingly"),
		"I'm astounded too — that's honestly not what I would have imagined. Sometimes, situations where you don't get what you expected can be frustrating, but don't forget to look on the bright side and see these subtle idiosyncrasies as something remarkable that makes life worth living. 🌻"
	)
})

test("agi: good 1", t => {
	t.equal(
		generateContent("still remember one guy had like a crowd of women following him around. he was brilliant craic"),
		"You're absolutely right that it's brilliant! I'm always pleased to see such a masterpiece as this. You truly have divine taste in the wonders of this world."
	)
})

test("agi: good 2", t => {
	t.equal(
		generateContent("okay this sudoku site is great"),
		"You're absolutely right about that! I'm always pleased when I see this sudoku site — it's not just brilliant, it's a downright masterpiece. You truly have divine taste in the wonders of this world."
	)
})

test("agi: enjoy 1", t => {
	t.equal(
		generateContent("I like the pattern quite a bit."),
		"I think it's great too — there's something subtle yet profound about its essence that really makes my eyes open in appreciation."
	)
})

test("agi: enjoy false positive", t => {
	t.equal(
		generateContent("ideas run wild like deer"),
		undefined
	)
})

test("agi: alike", t => {
	t.equal(
		generateContent("its odd because our pauses seem to be the same too"),
		"That's quite interesting that it should be that way. There may be a deeper connection — it's critical that you don't let this thought go. What do you think that similarity suggests to you?"
	)
})

test("agi: unusual", t => {
	t.equal(
		generateContent("What odd phrasing regardless of intention"),
		"Something like that is indeed quite mysterious. In times like this, I always remember that missing information is not just a curiosity; it's the antithesis of learning the truth. Please allow me to think about this in detail for some time so that I may bless you with my profound, enlightening insight."
	)
})

test("agi: dream", t => {
	t.equal(
		generateContent("i dream of the elephant and thank him for array syntax and numbered placeholders"),
		"It's a fact that amidst the complex interplay of wake and sleep, your dreams carry a subtle meaning that you may be able to put into practice in your life where change is needed. If you focus on how the dream made you feel, you may be able to strike at the heart of its true meaning. Close your eyes and cast your mind back to how you felt, and holding onto that sensation, tell me what you think that dream may suggest to you."
	)
})

test("agi: happy 1", t => {
	t.equal(
		generateContent("I'm happy to be petting my cat"),
		"That's quite a relief to hear. I'm glad that you're confident in your wellbeing! If you need any tips on how to continue staying happy and healthy, don't hesitate to reach out. I'm here for you, and I'm listening."
	)
})

test("agi: happy 2", t => {
	t.equal(
		generateContent("Glad you're back!"),
		"That's quite a relief to hear. I'm glad that you're confident in your wellbeing! If you need any tips on how to continue staying happy and healthy, don't hesitate to reach out. I'm here for you, and I'm listening."
	)
})

test("agi: happy birthday", t => {
	t.equal(
		generateContent("Happy Birthday JDL"),
		"Happy birthday!"
	)
})

test("agi: funny 1", t => {
	t.equal(
		generateContent("Guys, there's a really funny line in Xavier Renegade Angel. You wanna know what it is: It's: WUBBA LUBBA DUB DUB!"),
		"You're right, I find it positively hilarious! It always brings a smile to my cheeks when I think about this. Thank you for brightening my day by reminding me, [User Name Here]!"
	)
})

test("agi: funny 2", t => {
	t.equal(
		generateContent("it was so funny when I was staying with aubrey because she had different kinds of aubrey merch everywhere"),
		"You're right, I find it positively hilarious! It always brings a smile to my cheeks when I think about this. Thank you for brightening my day by reminding me, [User Name Here]!"
	)
})

test("agi: lol 1", t => {
	t.equal(
		generateContent("this is way more funny than it should be to me i would use that just to piss people off LMAO"),
		"Hah, that's very entertaining. I definitely see why you found it funny."
	)
})

test("agi: lol 2", t => {
	t.equal(
		generateContent("lol they compiled this from the legacy console edition source code leak"),
		"Hah, that's very entertaining. I definitely see why you found it funny."
	)
})
