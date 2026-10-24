"""Bounded, data-only contracts. Spider cannot submit orders or execute shell tools."""
def obj(properties):
    return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
def arr(item):return {'type':'array','items':item}
S={'type':'string'}
N={'type':'number'}
I={'type':'integer'}
RESEARCH_SCHEMA=obj({'headline':S,'sentiment':S,'drivers':arr(obj({'topic':S,'assessment':S,'sourceUrls':arr(S)})),
 'calendar':S,'sources':arr(obj({'title':S,'url':S,'publishedAt':S,'supports':S})), 'limitations':arr(S)})
ANNOTATION=obj({'id':S,'kind':{'type':'string','enum':['level','zone','path']},
 'role':{'type':'string','enum':['objective','liquidity','block','trap','invalidation','conditional']},
 'label':S,'reason':S,'state':{'type':'string','enum':['observed','conditional']},
 'time':I,'endTime':I,'price':N,'endPrice':N,'evidenceTimes':arr(I)})
FRAME=obj({'timeframe':S,'bias':S,'status':S,'thesis':S,'sequence':S,'nextEvent':S,'invalidation':S,'annotations':arr(ANNOTATION)})
ANALYSIS_SCHEMA=obj({'title':S,'stance':S,'summary':S,'keyLevels':S,'primaryPlan':S,'alternativePlan':S,
 'risk':S,'nextReview':S,'frames':arr(FRAME)})
