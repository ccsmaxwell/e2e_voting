var bigInt = require("big-integer");
var crypto = require('crypto');

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

	ballotChoiceProofVerify: function(p,g,y,a1,a2,e,f,c1,c2,v){
		let lhs1 = g.modPow(f,p);
		let rhs1 = a1.multiply(c1.modPow(e,p)).mod(p);
		let lhs2 = y.modPow(f,p);
		let rhs2 = a2.multiply((c2.multiply(g.modPow(v,p).modInv(p))).modPow(e,p)).mod(p);

		return lhs1.eq(rhs1) && lhs2.eq(rhs2);
	},

	ballotProofVerify: function(msg,p,g,y,v_min,v_max,c1,c2,proofArr){
		let e_all = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(msg)).digest('base64')),16).mod(p);
		let e_sum = bigInt(0);
		for(let v=v_min ; v<=v_max ; v++){
			let proof = module.exports.proofToHex(proofArr[v-v_min]);
			e_sum = e_sum.add(proof.e).mod(p);

			if(!module.exports.ballotChoiceProofVerify(p,g,y,proof.a1,proof.a2,proof.e,proof.f,c1,c2,v)){
				return false;
			}
		}

		if(!e_sum.eq(e_all)){
			return false;
		}

		return true;
	}

};