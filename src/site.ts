import profile from './data/profile.json';
// Edit these values. goatcounter = your GoatCounter site code (https://CODE.goatcounter.com)
export const site = { name: 'dangtai061127', github: 'https://github.com/dangtai061127', goatcounter: 'dangtai061127' };
export { profile };
const l = profile.links;
export const links: string[][] = [['GitHub', site.github], ['LinkedIn', l.linkedin], ['TryHackMe', l.tryhackme], ['BTLO', l.btlo], ['Email', l.email && `mailto:${l.email}`]].filter(([, h]) => h);
