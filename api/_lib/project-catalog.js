export const PROJECT_CATALOG = [
    {
        id: 'invest-in-inbest', name: 'Invest in inBest', category: 'Global organization', location: 'Worldwide',
        summary: 'The first official inBestmen campaign: build the people, technology and trust layer for a global social investment platform.',
        ibRaised: 12500, ibGoal: 1000000, visual: 'visual-education', icon: 'bi-globe', status: 'Example launch proposal',
        proposalUrl: 'https://inbestproject.wstudio3d.com/', demo: true
    },
    {
        id: 'blueloop', name: 'BlueLoop', category: 'Water / Climate', location: 'Nairobi, Kenya',
        summary: 'Solar-powered water kiosks with local ownership for neighborhoods existing infrastructure misses.',
        ibRaised: 8640, ibGoal: 12000, visual: 'visual-water', icon: 'bi-droplet-half', status: 'Example community vote',
        proposalUrl: 'project-proposal.html?id=blueloop', demo: true
    },
    {
        id: 'orbit-school', name: 'Orbit School', category: 'Education / AI', location: 'Medellín, Colombia',
        summary: 'A low-bandwidth learning network that gives young people a personal guide to new skills.',
        ibRaised: 5230, ibGoal: 10000, visual: 'visual-education', icon: 'bi-stars', status: 'Example community vote',
        proposalUrl: 'project-proposal.html?id=orbit-school', demo: true
    },
    {
        id: 'root-rise', name: 'Root & Rise', category: 'Food / Regeneration', location: 'Lisbon, Portugal',
        summary: 'Turning small urban spaces into productive, community-owned food gardens.',
        ibRaised: 3980, ibGoal: 8000, visual: 'visual-food', icon: 'bi-flower1', status: 'Example community vote',
        proposalUrl: 'project-proposal.html?id=root-rise', demo: true
    },
    {
        id: 'care-circle', name: 'Care Circle', category: 'Health / Wellbeing', location: 'Manila, Philippines',
        summary: 'A neighborhood care network that makes practical support easier to find and share.',
        ibRaised: 6710, ibGoal: 9000, visual: 'visual-health', icon: 'bi-heart-pulse', status: 'Example community vote',
        proposalUrl: 'project-proposal.html?id=care-circle', demo: true
    }
];

export const getCatalogProject = (projectId) => PROJECT_CATALOG.find((project) => project.id === String(projectId || '').trim()) || null;
