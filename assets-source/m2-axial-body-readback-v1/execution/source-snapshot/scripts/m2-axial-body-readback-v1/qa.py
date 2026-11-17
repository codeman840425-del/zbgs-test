"""Small refusals for collision reuse and inherited mixed-expression failure."""
import copy
import json

from common import BASE,equal_inputs,io,np,numeric_gate,outcome


def run():
    d={'P':np.zeros((3,3)),'N':np.ones((3,3)),'dP':[np.zeros((3,3)) for _ in range(54)],
        'dN':[np.zeros((3,3)) for _ in range(54)],'mapping':{'oh':1},'triangles':{'test':np.array([[0,1,2]])},
        'ids':{'test':np.arange(3)},'corrected':np.array([0,1])}
    checks=[]
    assert equal_inputs(d,copy.deepcopy(d))[0];checks.append('same-input-reuse-eligible')
    changed=copy.deepcopy(d);changed['dP'][1][0,0]=.001
    assert not equal_inputs(d,changed)[0];checks.append('changed-target-position-not-reusable')
    def refuses(name,operation):
        try: operation()
        except (ValueError,KeyError): checks.append(name)
        else: raise AssertionError('Expected refusal '+name)
    changed=copy.deepcopy(d);changed['dP'].pop()
    refuses('missing-real-target',lambda:equal_inputs(d,changed))
    changed=copy.deepcopy(d);changed['corrected']=np.array([0])
    refuses('wrong-negative-compensation-mask',lambda:equal_inputs(d,changed))
    changed=copy.deepcopy(d);changed['triangles']['test']=np.array([[0,2,1]])
    refuses('changed-contact-triangle-order',lambda:equal_inputs(d,changed))
    refuses('head-only-verdict-cannot-authorize-body',lambda:numeric_gate({'schema':'axial-head-evaluation-result-v1'},{}))
    assert outcome(0,1)=='failed-not-admissible';checks.append('known-oh-one-new-pair-stays-failed')
    assert outcome(0,0)=='face-contact-readback-passed-body-contact-pending';checks.append('face-zero-pairs-not-full-body-clearance')
    return {'schema':'axial-body-readback-prepare-qa-v1','passed':True,'checks':checks,'contactsExecuted':False}


if __name__=='__main__':
    r=run();io.save(BASE/'qa-report.json',r);print(json.dumps(r))
