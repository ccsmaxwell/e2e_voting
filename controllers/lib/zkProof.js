var bigInt = require("big-integer");
var crypto = require('crypto');

var encoding = require('./encoding');

module.exports = {

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
			let proof = encoding.bulkBase64ToBinInt(proofArr[v-v_min], ['a1', 'a2', 'e', 'f']);
			e_sum = e_sum.add(proof.e).mod(p);

			if(!module.exports.ballotChoiceProofVerify(p,g,y,proof.a1,proof.a2,proof.e,proof.f,c1,c2,v)){
				return false;
			}
		}
		if(!e_sum.eq(e_all)){
			return false;
		}
		return true;
	},

	trusteeDecryptVerify: function(electionKey, trustee_pubKey, prevDecrypt, currDecrypt, proof){
		var p = bigInt(encoding.base64ToHex(electionKey.p),16);
		var g = bigInt(encoding.base64ToHex(electionKey.g),16);
		var trustee_y = bigInt(encoding.base64ToHex(trustee_pubKey),16);

		var result = true;
		proof.forEach(function(s, si){
			s.forEach(function(q, qi){
				q.forEach(function(a, ai){
					let c1 = bigInt(encoding.base64ToHex(prevDecrypt[si][qi][ai].c1),16);
					let proofHex = encoding.bulkBase64ToBinInt(proof[si][qi][ai], ['a1', 'a2', 'f', 'd']);

					let msg = electionKey.g + proof[si][qi][ai].a1 + trustee_pubKey + proof[si][qi][ai].a2 + proof[si][qi][ai].d;
					let e = bigInt(encoding.base64ToHex(crypto.createHash('sha256').update(JSON.stringify(msg)).digest('base64')), 16);

					let lhs1 = g.modPow(proofHex.f,p);
					let rhs1 = proofHex.a1.multiply(trustee_y.modPow(e,p)).mod(p);
					let lhs2 = c1.modPow(proofHex.f,p);
					let rhs2 = proofHex.a2.multiply(proofHex.d.modPow(e,p)).mod(p);
					if(!lhs1.eq(rhs1) || !lhs2.eq(rhs2)){
						result = false;
						console.log("Trustee decrypt proof fail: ", si, qi, ai);
					}

					let prev_c1x = bigInt(encoding.base64ToHex(prevDecrypt[si][qi][ai].c1x),16);
					let curr_c1x = bigInt(encoding.base64ToHex(currDecrypt[si][qi][ai].c1x),16);
					let d = bigInt(encoding.base64ToHex(proof[si][qi][ai].d),16);
					if(!curr_c1x.eq(prev_c1x.multiply(d).mod(p))){
						result = false;
						console.log("Trustee decrypt proof fail (c1x,d not match): ", si, qi, ai);
					}
				})
			})
		})
		return result;
	}

};