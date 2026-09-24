export type RatedStory = { rating:string|null; topics:string; source_id:string };
export type FeedStory = RatedStory & { id:string; important:number; published_at:number; discovered_at:number; viewed_at:number|null };
export type InterestProfile = { topics:Record<string,number>; sources:Record<string,number>; positives:number; negatives:number };

function topicsOf(value:string):string[]{
 try{const parsed:unknown=JSON.parse(value);return Array.isArray(parsed)?[...new Set(parsed.filter((x):x is string=>typeof x==="string"))]:[]}catch{return []}
}

// Shrink sparse feedback toward zero so one click cannot dominate an entire topic.
function weight(positive:number,negative:number,scale:number){return scale*(positive-negative)/(2+positive+negative)}

export function buildInterestProfile(rows:RatedStory[]):InterestProfile{
 const topicCounts=new Map<string,{positive:number;negative:number}>(),sourceCounts=new Map<string,{positive:number;negative:number}>();
 let positives=0,negatives=0;
 for(const row of rows){
  if(row.rating!=="useful"&&row.rating!=="uninteresting")continue;
  const good=row.rating==="useful";if(good)positives++;else negatives++;
  const tags=topicsOf(row.topics),share=1/Math.sqrt(Math.max(1,tags.length));
  for(const tag of tags){const count=topicCounts.get(tag)||{positive:0,negative:0};count[good?"positive":"negative"]+=share;topicCounts.set(tag,count)}
  if(row.source_id){const count=sourceCounts.get(row.source_id)||{positive:0,negative:0};count[good?"positive":"negative"]++;sourceCounts.set(row.source_id,count)}
 }
 const topics:Record<string,number>=Object.create(null),sources:Record<string,number>=Object.create(null);
 for(const [key,count] of topicCounts)topics[key]=weight(count.positive,count.negative,2.8);
 for(const [key,count] of sourceCounts)sources[key]=weight(count.positive,count.negative,1.8);
 return {topics,sources,positives,negatives};
}

function alignment(story:FeedStory,profile:InterestProfile,selectedTopics:Set<string>,selectedSources:Set<string>){
 const tags=topicsOf(story.topics);
 const manualTopic=tags.some(tag=>selectedTopics.has(tag))?1.7:0;
 const manualSource=selectedSources.has(story.source_id)?1.2:0;
 const learnedTopic=tags.length?tags.reduce((sum,tag)=>sum+(profile.topics[tag]||0),0)/tags.length:0;
 return manualTopic+manualSource+learnedTopic+(profile.sources[story.source_id]||0);
}

function freshness(story:FeedStory,now:number){
 const sourceDated=Math.abs(story.published_at-story.discovered_at)>1000;
 if(!sourceDated)return .1;
 const age=Math.max(0,now-story.published_at);
 return .7*Math.exp(-age/(14*86400000));
}

export function personalizeFeed<T extends FeedStory>(stories:T[],profile:InterestProfile,selectedTopics:string[],selectedSources:string[],now=Date.now()):T[]{
 const topics=new Set(selectedTopics),sources=new Set(selectedSources);
 const ranked=stories.filter(story=>story.important||story.rating!=="uninteresting"||story.viewed_at).map(story=>{
  const match=alignment(story,profile,topics,sources);
  return {story,match,score:match+freshness(story,now)};
 }).sort((a,b)=>Number(b.story.important)-Number(a.story.important)||b.score-a.score||b.story.published_at-a.story.published_at);

 // Without positive evidence or explicit interests, keep broad discovery.
 if(!topics.size&&!sources.size&&!profile.positives)return ranked.map(x=>x.story);
 const chosen=new Set(ranked.filter(x=>x.story.important||x.story.rating==="uninteresting"&&x.story.viewed_at||x.match>=.5).map(x=>x.story.id));
 // Keep a small window onto new topics; negative signals lower relevance but do not ban a field.
 const discoveryLimit=Math.min(8,Math.max(3,Math.ceil(ranked.length*.15)));
 const discovery=ranked.filter(x=>!chosen.has(x.story.id)&&x.match>=-.5)
  .sort((a,b)=>Number(Boolean(a.story.viewed_at))-Number(Boolean(b.story.viewed_at))||b.story.discovered_at-a.story.discovered_at)
  .slice(0,discoveryLimit);
 for(const item of discovery)chosen.add(item.story.id);
 return ranked.filter(x=>chosen.has(x.story.id)).map(x=>x.story);
}
