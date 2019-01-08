var bigInt = require("big-integer");

var encoding = require('./encoding');

module.exports = {

	proofToHex: function(proof){
		return {
			a1: bigInt(encoding.base64ToHex(proof.a1),16),
			a2: bigInt(encoding.base64ToHex(proof.a2),16),
			e: bigInt(encoding.base64ToHex(proof.e),16),
			f: bigInt(encoding.base64ToHex(proof.f),16)
		}
	},

	verifyBallot: function(p,g,y,a1,a2,e,f,c1,c2,v){
		let lhs1 = g.modPow(f,p);
		let rhs1 = a1.multiply(c1.modPow(e,p)).mod(p);
		let lhs2 = y.modPow(f,p);
		let rhs2 = a2.multiply((c2.multiply(g.modPow(v,p).modInv(p))).modPow(e,p)).mod(p);

		return lhs1.eq(rhs1) && lhs2.eq(rhs2);
	}

};