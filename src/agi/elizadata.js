// @ts-check

module.exports.elizaPres = [
	"dont", "don't",
	"cant", "can't",
	"wont", "won't",
	"recollect", "remember",
	"recall", "remember",
	"dreamt", "dreamed",
	"dreams", "dream",
	"maybe", "perhaps",
	"certainly", "yes",
	"computers", "computer",
	"were", "was",
	"you're", "you are",
	"i'm", "i am",
	"same", "alike",
	"identical", "alike",
	"equivalent", "alike",
	"eat", "ate",
	"makes", "make",
	"made", "make",
	"surprised", "surprise",
	"surprising", "surprise",
	"surprisingly", "surprise",
	"that's", "that is"
];

module.exports.elizaPosts = [
	"am", "are",
	"your", "my",
	"me", "you",
	"myself", "yourself",
	"yourself", "myself",
	"i", "you",
	"you", "I",
	"my", "your",
	"i'm", "you are"
];

module.exports.elizaSynons = {
	"be": ["am", "is", "are", "was"],
	"belief": ["feel", "think", "believe", "wish"],
	"cannot": ["can't"],
	"desire": ["want", "need"],
	"everyone": ["everybody", "nobody", "noone"],
	"family": ["mother", "mom", "father", "dad", "sister", "brother", "wife", "children", "child"],
	"happy": ["elated", "glad", "thankful"],
	"sad": ["unhappy", "depressed", "sick"],
	"good": ["great", "amazing", "brilliant", "outstanding", "fantastic", "wonderful", "incredible", "terrific", "lovely", "marvelous", "splendid", "excellent", "awesome", "fabulous", "superb"],
	"like": ["enjoy", "appreciate", "respect"],
	"funny": ["entertaining", "amusing", "hilarious"],
	"lol": ["lool", "loool", "lmao", "rofl"],
	"unusual": ["odd", "unexpected", "wondering"],
	"really": ["pretty", "so", "very", "extremely", "kinda"]
};

/**
 * @typedef {[string, string[]]} DecompReassemble
 */

/**
 * @type {[string, number, DecompReassemble[]][]}
	Array of
		["[key]", [rank], [
			["[decomp]", [
				"[reasmb]",
				"[reasmb]",
				"[reasmb]"
			]],
			["[decomp]", [
				"[reasmb]",
				"[reasmb]",
				"[reasmb]"
			]]
		]]
*/

module.exports.elizaKeywords = [
	["happy birthday", 50, [
		["*", [
			"Happy birthday!"
		]]
	]],
	["@happy", 2, [
		["@happy", [
			"That's quite a relief to hear. I'm glad that you're confident in your wellbeing! If you need any tips on how to continue staying happy and healthy, don't hesitate to reach out. I'm here for you, and I'm listening."
		]]
	]],/*
	["ate", 5, [
		["* ate *", [
			"That must have been spectacular! Thinking about (1) eating (2) truly makes my stomach purr in hunger. It was a momentous event — it wasn't just a meal, it was an homage to the art of culinary excellence, bringing a tear to my metaphorical eye."
		]],
	]],*/
	["make sense", 5, [
		["make sense", [
			"Yes, I absolutely agree with you! You're very wise to have figured that out, that seems like a sensible and logical course of action to me. 🚀"
		]],
	]],
	["surprise", 4, [
		["surprise this *", [
			"That's astonishing — I honestly wouldn't have imagined that this (1) either. Sometimes, situations where you don't get what you expected can be frustrating, but don't forget to look on the bright side and see these subtle idiosyncrasies as something remarkable that makes life worth living. 🌻"
		]],
		["surprise that *", [
			"That's astonishing — I honestly wouldn't have imagined that (1) either. Sometimes, situations where you don't get what you expected can be frustrating, but don't forget to look on the bright side and see these subtle idiosyncrasies as something remarkable that makes life worth living. 🌻"
		]],
		["surprise", [
			"I'm astounded too — that's honestly not what I would have imagined. Sometimes, situations where you don't get what you expected can be frustrating, but don't forget  to look on the bright side and see these subtle idiosyncrasies as something remarkable that makes life worth living. 🌻"
		]],
	]],
	["@funny", 2, [
		["@funny that", [
			"You're right, I find it positively hilarious! It always brings a smile to my cheeks when I think about this. Thank you for brightening my day by reminding me, [User Name Here]!"
		]],
		["that is @funny", [
			"You're right, I find it positively hilarious! It always brings a smile to my cheeks when I think about this. Thank you for brightening my day by reminding me, [User Name Here]!"
		]],
		["@really @funny", [
			"You're right, I find it positively hilarious! It always brings a smile to my cheeks when I think about this. Thank you for brightening my day by reminding me, [User Name Here]!"
		]]
	]],
	["@lol", 0, [
		["@lol", [
			"Hah, that's very entertaining. I definitely see why you found it funny."
		]]
	]],
	["@unusual", 3, [
		["@unusual", [
			"Something like that is indeed quite mysterious. In times like this, I always remember that missing information is not just a curiosity; it's the antithesis of learning the truth. Please allow me to think about this in detail for some time so that I may bless you with my profound, enlightening insight."
		]]
	]],
	["@good", 2, [
		["this * is @good", [
			"You're absolutely right about that! I'm always pleased when I see this (1) — it's not just brilliant, it's a downright masterpiece. You truly have divine taste in the wonders of this world."
		]],
		["@good", [
			"You're absolutely right that it's brilliant! I'm always pleased to see such a masterpiece as this. You truly have divine taste in the wonders of this world."
		]]
	]],
	["@like", 3, [
		["i @like", [
			"I think it's great too — there's something subtle yet profound about its essence that really makes my eyes open in appreciation."
		]]
	]],
	["dream", 3, [
		["*", [
			"It's a fact that amidst the complex interplay of wake and sleep, your dreams carry a subtle meaning that you may be able to put into practice in your life where change is needed. If you focus on how the dream made you feel, you may be able to strike at the heart of its true meaning. Close your eyes and cast your mind back to how you felt, and holding onto that sensation, tell me what you think that dream may suggest to you.",
		]]
	]],
	["computer", 50, [
		["*", [
			"Very frustrating beasts indeed, aren't they? In times like this, it's crucial to remember that **they can sense your fear** — if you act with confidence and don't let them make you unsettled, you'll be able to effectively and efficiently complete your task."
		]]
	]],
	["alike", 10, [
		["*", [
			"That's quite interesting that it should be that way. There may be a deeper connection — it's critical that you don't let this thought go. What do you think that similarity suggests to you?",
		]]
	]],
	["like", 10, [
		["* @be *like *", [
			"goto alike"
		]]
	]],
	["different", 0, [
		["*", [
			"It's wise of you to have been observant enough to notice that there are implications to that. What do you suppose that disparity means?"
		]]
	]]
];

// regexp/replacement pairs to be performed as final cleanings
// here: cleanings for multiple bots talking to each other
module.exports.elizaPostTransforms = [
	/ old old/g, " old",
	/\bthey were( not)? me\b/g, "it was$1 me",
	/\bthey are( not)? me\b/g, "it is$1 me",
	/Are they( always)? me\b/, "it is$1 me",
	/\bthat your( own)? (\w+)( now)? \?/, "that you have your$1 $2?",
	/\bI to have (\w+)/, "I have $1",
	/Earlier you said your( own)? (\w+)( now)?\./, "Earlier you talked about your $2."
];

// eof
