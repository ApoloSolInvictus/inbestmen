const proposals = {
    'blueloop': { name: 'BlueLoop', category: 'Water / Climate', location: 'Nairobi, Kenya', raised: 8640, goal: 12000, summary: 'Solar-powered water kiosks with local ownership for neighborhoods existing infrastructure misses.', opportunity: 'Reliable, local water access can reduce the distance families travel and create a stronger community service layer.', approach: 'BlueLoop combines solar infrastructure with local operators, transparent progress updates and a model that can be repeated across neighborhoods.', unlocks: 'Community backing helps move the pilot from a promising idea toward verified local delivery.' },
    'orbit-school': { name: 'Orbit School', category: 'Education / AI', location: 'Medellín, Colombia', raised: 5230, goal: 10000, summary: 'A low-bandwidth learning network that gives young people a personal guide to new skills.', opportunity: 'Young people need accessible pathways to practical skills that work with the connectivity and resources they already have.', approach: 'Orbit School pairs a lightweight learning experience with human guidance and an AI learning companion.', unlocks: 'Support helps expand the curriculum, reach new learners and measure the learning journey.' },
    'root-rise': { name: 'Root & Rise', category: 'Food / Regeneration', location: 'Lisbon, Portugal', raised: 3980, goal: 8000, summary: 'Turning small urban spaces into productive, community-owned food gardens.', opportunity: 'Small urban spaces can become shared assets that improve food resilience, local knowledge and connection.', approach: 'Root & Rise gives neighborhoods a practical garden model, shared tools and a way to document the harvest.', unlocks: 'Support moves the project toward more gardens, training sessions and local participation.' },
    'care-circle': { name: 'Care Circle', category: 'Health / Wellbeing', location: 'Manila, Philippines', raised: 6710, goal: 9000, summary: 'A neighborhood care network that makes practical support easier to find and share.', opportunity: 'People often need practical support before they need a formal intervention; trusted local connections can make that support visible.', approach: 'Care Circle connects neighbors, volunteers and resources through a simple, accountable coordination layer.', unlocks: 'Support helps strengthen the network, document outcomes and reach additional neighborhoods.' },
    'solar-commons': { name: 'Solar Commons', category: 'Energy / Community', location: 'Mombasa, Kenya', raised: 14200, goal: 14000, summary: 'Community-owned solar charging hubs are now serving three neighborhoods.', opportunity: 'Reliable community energy can keep essential services connected while local ownership keeps the benefits close to home.', approach: 'Solar Commons combines practical solar hubs, neighborhood operators and transparent progress reporting.', unlocks: 'The completed goal helped move the pilot into a visible, repeatable community model.' },
    'makers-of-tomorrow': { name: 'Makers of Tomorrow', category: 'Education / Access', location: 'Oaxaca, Mexico', raised: 9800, goal: 9800, summary: 'A shared workshop now gives local makers tools, training and a place to teach.', opportunity: 'Access to tools and practical learning can turn local creativity into durable opportunity.', approach: 'Makers of Tomorrow provides a shared workshop, peer teaching and a public record of what participants build.', unlocks: 'The completed goal opened the workshop and created a foundation for the next generation of makers.' }
};
const id = new URLSearchParams(window.location.search).get('id');
const project = proposals[id];
if (!project) document.getElementById('proposalError').hidden = false;
else {
    const progress = Math.min(100, Math.round((project.raised / project.goal) * 100));
    document.getElementById('proposalName').textContent = project.name;
    document.getElementById('proposalCategory').textContent = project.category;
    document.getElementById('proposalLocation').textContent = project.location;
    document.getElementById('proposalSummary').textContent = project.summary;
    document.getElementById('proposalProgress').textContent = `${progress}%`;
    document.getElementById('proposalBar').style.width = `${progress}%`;
    document.getElementById('proposalRaised').textContent = `${project.raised.toLocaleString()} iB raised`;
    document.getElementById('proposalGoal').textContent = `Goal ${project.goal.toLocaleString()} iB`;
    document.getElementById('proposalOpportunity').textContent = project.opportunity;
    document.getElementById('proposalApproach').textContent = project.approach;
    document.getElementById('proposalUnlocks').textContent = project.unlocks;
    document.getElementById('proposalApp').hidden = false;
}
