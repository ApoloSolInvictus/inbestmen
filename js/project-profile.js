const projectNav = document.querySelector('.project-profile-nav');
const projectMenuButton = document.querySelector('.project-menu-button');

projectMenuButton?.addEventListener('click', () => {
    const open = projectNav.classList.toggle('nav-open');
    projectMenuButton.setAttribute('aria-label', open ? 'Close project menu' : 'Open project menu');
});

document.querySelectorAll('.project-profile-nav nav a').forEach((link) => link.addEventListener('click', () => projectNav.classList.remove('nav-open')));
