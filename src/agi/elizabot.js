/*
	---
	elizabot.js v.1.1 - ELIZA JS library (N.Landsteiner 2005)
	https://www.masswerk.at/elizabot/
	Free Software © Norbert Landsteiner 2005
	---
	Modified by Cadence Ember in 2025 for v1.2 (unofficial)
		* Changed to class structure
		* Load from local file and instance instead of global variables
		* Remove memory
		* Remove xnone
		* Remove initials
		* Remove finals
		* Allow substitutions in rule keys
	---

	Eliza is a mock Rogerian psychotherapist.
	Original program by Joseph Weizenbaum in MAD-SLIP for "Project MAC" at MIT.
	cf: Weizenbaum, Joseph "ELIZA - A Computer Program For the Study of Natural Language
			Communication Between Man and Machine"
			in: Communications of the ACM; Volume 9 , Issue 1 (January 1966): p 36-45.
	JavaScript implementation by Norbert Landsteiner 2005; <http://www.masserk.at>

  	synopsis:
		new ElizaBot( <random-choice-disable-flag> )
		ElizaBot.prototype.transform( <inputstring> )
		ElizaBot.prototype.reset()

  	usage:
		var eliza = new ElizaBot();
		var reply = eliza.transform(inputstring);

		// to reproduce the example conversation given by J. Weizenbaum
		// initialize with the optional random-choice-disable flag
		var originalEliza = new ElizaBot(true);

	`ElizaBot' is also a general chatbot engine that can be supplied with any rule set.
	(for required data structures cf. "elizadata.js" and/or see the documentation.)
	data is parsed and transformed for internal use at the creation time of the
	first instance of the `ElizaBot' constructor.

  	vers 1.1: lambda functions in RegExps are currently a problem with too many browsers.
		changed code to work around.
*/

// @ts-check

const passthrough = require("../passthrough")
const {sync} = passthrough

/** @type {import("./elizadata")} */
const data = sync.require("./elizadata")

class ElizaBot {
	/** @type {any} */
	elizaKeywords = [['###',0,[['###',[]]]]];
	pres={};
	preExp = /####/;
	posts={};
	postExp = /####/;

	/**
	 * @param {boolean} noRandomFlag
	 */
	constructor(noRandomFlag) {
		this.noRandom= !!noRandomFlag;
		this.capitalizeFirstLetter=true;
		this.debug=false;
		this.version="1.2";
		this._init();
		this.reset();
	}

	reset() {
		this.lastchoice=[];
		for (let k=0; k<data.elizaKeywords.length; k++) {
			this.lastchoice[k]=[];
			var rules=data.elizaKeywords[k][2];
			for (let i=0; i<rules.length; i++) this.lastchoice[k][i]=-1;
		}
	}

	_init() {
		// parse data and convert it from canonical form to internal use
		// prodoce synonym list
		var synPatterns={};
		if ((data.elizaSynons) && (typeof data.elizaSynons == 'object')) {
			for (let i in data.elizaSynons) synPatterns[i]='('+i+'|'+data.elizaSynons[i].join('|')+')';
		}
		// check for keywords or install empty structure to prevent any errors
		if (data.elizaKeywords) this.elizaKeywords = structuredClone(data.elizaKeywords)
		// 1st convert rules to regexps
		// expand synonyms and insert asterisk expressions for backtracking
		var sre=/@(\S+)/;
		var are=/(\S)\s*\*\s*(\S)/;
		var are1=/^\s*\*\s*(\S)/;
		var are2=/(\S)\s*\*\s*$/;
		var are3=/^\s*\*\s*$/;
		var wsre=/\s+/g;
		for (let k=0; k<this.elizaKeywords.length; k++) {
			var m=sre.exec(this.elizaKeywords[k][0]);
			while (m) {
				var sp=(synPatterns[m[1]])? synPatterns[m[1]]:m[1];
				this.elizaKeywords[k][0]=this.elizaKeywords[k][0].substring(0,m.index)+sp+this.elizaKeywords[k][0].substring(m.index+m[0].length);
				m=sre.exec(this.elizaKeywords[k][0]);
			}
			var rules=this.elizaKeywords[k][2];
			this.elizaKeywords[k][3]=k; // save original index for sorting
			for (let i=0; i<rules.length; i++) {
				var r=rules[i];
				// check mem flag and store it as decomp's element 2
				if (r[0].charAt(0)=='$') {
					var ofs=1;
					while (r[0].charAt[ofs]==' ') ofs++;
					r[0]=r[0].substring(ofs);
					r[2]=true;
				}
				else {
					r[2]=false;
				}
				// expand synonyms (v.1.1: work around lambda function)
				var m=sre.exec(r[0]);
				while (m) {
					var sp=(synPatterns[m[1]])? synPatterns[m[1]]:m[1];
					r[0]=r[0].substring(0,m.index)+sp+r[0].substring(m.index+m[0].length);
					m=sre.exec(r[0]);
				}
				// expand asterisk expressions (v.1.1: work around lambda function)
				if (are3.test(r[0])) {
					r[0]='\\s*(.*)\\s*';
				}
				else {
					m=are.exec(r[0]);
					if (m) {
						let lp='';
						let rp=r[0];
						while (m) {
							lp+=rp.substring(0,m.index+1);
							if (m[1]!=')') lp+='\\b';
							lp+='\\s*(.*)\\s*';
							if ((m[2]!='(') && (m[2]!='\\')) lp+='\\b';
							lp+=m[2];
							rp=rp.substring(m.index+m[0].length);
							m=are.exec(rp);
						}
						r[0]=lp+rp;
					}
					m=are1.exec(r[0]);
					if (m) {
						let lp='\\s*(.*)\\s*';
						if ((m[1]!=')') && (m[1]!='\\')) lp+='\\b';
						r[0]=lp+r[0].substring(m.index-1+m[0].length);
					}
					m=are2.exec(r[0]);
					if (m) {
						let lp=r[0].substring(0,m.index+1);
						if (m[1]!='(') lp+='\\b';
						r[0]=lp+'\\s*(.*)\\s*';
					}
				}
				// expand white space
				r[0]=r[0].replace(wsre, '\\s+');
				wsre.lastIndex=0;
			}
		}
		// now sort keywords by rank (highest first)
		this.elizaKeywords.sort(this._sortKeywords);
		// and compose regexps and refs for pres and posts
		if ((data.elizaPres) && (data.elizaPres.length)) {
			var a=[];
			for (let i=0; i<data.elizaPres.length; i+=2) {
				a.push(data.elizaPres[i]);
				this.pres[data.elizaPres[i]]=data.elizaPres[i+1];
			}
			this.preExp = new RegExp('\\b('+a.join('|')+')\\b');
		}
		else {
			// default (should not match)
			this.pres['####']='####';
		}
		if ((data.elizaPosts) && (data.elizaPosts.length)) {
			var a=[];
			for (let i=0; i<data.elizaPosts.length; i+=2) {
				a.push(data.elizaPosts[i]);
				this.posts[data.elizaPosts[i]]=data.elizaPosts[i+1];
			}
			this.postExp = new RegExp('\\b('+a.join('|')+')\\b');
		}
		else {
			// default (should not match)
			this.posts['####']='####';
		}
	}

	_sortKeywords(a,b) {
		// sort by rank
		if (a[1]>b[1]) return -1
		else if (a[1]<b[1]) return 1
		// or original index
		else if (a[3]>b[3]) return 1
		else if (a[3]<b[3]) return -1
		else return 0;
	}

	transform(text) {
		var rpl='';
		// unify text string
		text=text.toLowerCase();
		text=text.replace(/@#\$%\^&\*\(\)_\+=~`\{\[\}\]\|:;<>\/\\\t/g, ' ');
		text=text.replace(/\s+-+\s+/g, '.');
		text=text.replace(/\s*[,\.\?!;]+\s*/g, '.');
		text=text.replace(/\s*\bbut\b\s*/g, '.');
		text=text.replace(/\s{2,}/g, ' ');
		// split text in part sentences and loop through them
		var parts=text.split('.');
		for (let i=0; i<parts.length; i++) {
			var part=parts[i];
			if (part!='') {
				// preprocess (v.1.1: work around lambda function)
				var m=this.preExp.exec(part);
				if (m) {
					var lp='';
					var rp=part;
					while (m) {
						lp+=rp.substring(0,m.index)+this.pres[m[1]];
						rp=rp.substring(m.index+m[0].length);
						m=this.preExp.exec(rp);
					}
					part=lp+rp;
				}
				this.sentence=part;
				// loop trough keywords
				for (let k=0; k<this.elizaKeywords.length; k++) {
					if (part.search(new RegExp('\\b'+this.elizaKeywords[k][0]+'\\b', 'i'))>=0) {
						rpl = this._execRule(k);
					}
					if (rpl!='') return rpl;
				}
			}
		}
		// return reply or default string
		return rpl || undefined
	}

	_execRule(k) {
		var rule=this.elizaKeywords[k];
		var decomps=rule[2];
		var paramre=/\(([0-9]+)\)/;
		for (let i=0; i<decomps.length; i++) {
			var m=this.sentence.match(decomps[i][0]);
			if (m!=null) {
				var reasmbs=decomps[i][1];
				var memflag=decomps[i][2];
				var ri= (this.noRandom)? 0 : Math.floor(Math.random()*reasmbs.length);
				if (((this.noRandom) && (this.lastchoice[k][i]>ri)) || (this.lastchoice[k][i]==ri)) {
					ri= ++this.lastchoice[k][i];
					if (ri>=reasmbs.length) {
						ri=0;
						this.lastchoice[k][i]=-1;
					}
				}
				else {
					this.lastchoice[k][i]=ri;
				}
				var rpl=reasmbs[ri];
				if (this.debug) alert('match:\nkey: '+this.elizaKeywords[k][0]+
					'\nrank: '+this.elizaKeywords[k][1]+
					'\ndecomp: '+decomps[i][0]+
					'\nreasmb: '+rpl);
				if (rpl.search('^goto ', 'i')==0) {
					ki=this._getRuleIndexByKey(rpl.substring(5));
					if (ki>=0) return this._execRule(ki);
				}
				// substitute positional params (v.1.1: work around lambda function)
				var m1=paramre.exec(rpl);
				if (m1) {
					var lp='';
					var rp=rpl;
					while (m1) {
						var param = m[parseInt(m1[1])];
						// postprocess param
						var m2=this.postExp.exec(param);
						if (m2) {
							var lp2='';
							var rp2=param;
							while (m2) {
								lp2+=rp2.substring(0,m2.index)+this.posts[m2[1]];
								rp2=rp2.substring(m2.index+m2[0].length);
								m2=this.postExp.exec(rp2);
							}
							param=lp2+rp2;
						}
						lp+=rp.substring(0,m1.index)+param;
						rp=rp.substring(m1.index+m1[0].length);
						m1=paramre.exec(rp);
					}
					rpl=lp+rp;
				}
				rpl=this._postTransform(rpl);
				return rpl;
			}
		}
		return '';
	}

	_postTransform(s) {
		// final cleanings
		s=s.replace(/\s{2,}/g, ' ');
		s=s.replace(/\s+\./g, '.');
		if ((data.elizaPostTransforms) && (data.elizaPostTransforms.length)) {
			for (let i=0; i<data.elizaPostTransforms.length; i+=2) {
				s=s.replace(data.elizaPostTransforms[i], data.elizaPostTransforms[i+1]);
				data.elizaPostTransforms[i].lastIndex=0;
			}
		}
		// capitalize first char (v.1.1: work around lambda function)
		if (this.capitalizeFirstLetter) {
			var re=/^([a-z])/;
			var m=re.exec(s);
			if (m) s=m[0].toUpperCase()+s.substring(1);
		}
		return s;
	}

	_getRuleIndexByKey(key) {
		for (let k=0; k<this.elizaKeywords.length; k++) {
			if (this.elizaKeywords[k][0]==key) return k;
		}
		return -1;
	}
}

module.exports.ElizaBot = ElizaBot
