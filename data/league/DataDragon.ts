/* eslint-disable @typescript-eslint/camelcase */
import needle from 'needle';
import * as fs from 'fs';
import cliProgress from 'cli-progress';
import path, { join } from 'path';
import logger from '../../logging';
import { Champion, Spell } from '../../types/dto';
import State from '../../state';

const log = logger('datadragon');
const realm = 'euw';

class DataDragon {
    versions = {
        n: {
            champion: '',
            item: ''
        },
        cdn: ''
    };
    champions: Array<Champion> = [];
    summonerSpells: Array<Spell> = [];
    state: State;

    constructor(state: State) {
        this.state = state;
    }

    async init(): Promise<void> {
        const config = this.state.getConfig();

        if (config.contentPatch === 'latest') {
            log.info('Getting latest versions from ddragon.');
            this.versions = (await needle('get', `https://ddragon.leagueoflegends.com/realms/${realm}.json`, { json: true })).body;
        } else {
            log.info(`Using version from configuration: ${config.contentPatch}`);
            this.versions = {
                cdn: config.contentCdn,
                n: {
                    champion: config.contentPatch,
                    item: config.contentPatch
                }
            }
        }

        this.state.data.meta.version = {
            champion: this.versions.n.champion,
            item: this.versions.n.item,
        };
        this.state.data.meta.cdn = this.versions.cdn;
        this.state.triggerUpdate();

        log.info(`Champion: ${this.state.data.meta.version.champion}, Item: ${this.state.data.meta.version.item}, CDN: ${this.state.data.meta.cdn}`);

        this.champions = Object.values((await needle('get', `${this.state.data.meta.cdn}/${this.state.data.meta.version.champion}/data/pt_BR/champion.json`, { json: true })).body.data);
        log.info(`Loaded ${this.champions.length} champions`);
        let skins = 0
        log.info('Loading Champions Skins');
        const cacheDir = path.join(`./cache/${this.state.data.meta.version.champion}_info`);
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

        const bar = new cliProgress.Bar({
            format: 'Downloading skins relation [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        });
        bar.start(this.champions.length, 0);
        while (skins < this.champions.length) {
            const cachePath = path.join(`./cache/${this.state.data.meta.version.champion}_info/${this.champions[skins].id}.json`)
            let championInfo: any
            if (fs.existsSync(cachePath)) {
                championInfo = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
            } else {
                championInfo = (await needle('get', `${this.state.data.meta.cdn}/${this.state.data.meta.version.champion}/data/pt_BR/champion/${this.champions[skins].id}.json`, { json: true })).body.data
                championInfo = championInfo[this.champions[skins].id]
                fs.writeFileSync(cachePath, JSON.stringify(championInfo))
            }
            this.champions[skins].skins = championInfo.skins
            skins++;
            bar.update(skins)
        }
        bar.stop();
        this.summonerSpells = Object.values((await needle('get', `${this.state.data.meta.cdn}/${this.state.data.meta.version.item}/data/pt_BR/summoner.json`, { json: true })).body.data);
        log.info(`Loaded ${this.summonerSpells.length} summoner spells`);

        // Download all champion images and spell images
        await this.checkLocalCache();
    }

    getChampionById(id: number, skin_id?: number): Champion | null {
        return this.champions.find((champion: Champion) => {
            if (parseInt(champion.key || '0', 10) === id) {
                return this.extendChampionLocal(champion, skin_id);
            }
        }) || null;
    }

    extendChampion(champion: Champion): Champion {
        champion.splashImg = `${this.state.getCDN()}/img/champion/splash/${champion.id}_0.jpg`;
        // champion.splashCenteredImg = `https://cdn.communitydragon.org/${this.state.getVersion()}/champion/${champion.id}/splash-art/centered`;
        // Data Dragon CDN broken workaround
        const champion_slug = champion.name.toLowerCase().replace(/[^a-zA-Z]+/g, '');
        const champion_skins_url = `https://raw.communitydragon.org/${this.state.getMajorMinorVersion()}/plugins/rcp-be-lol-game-data/global/default/assets/characters/${champion_slug}/skins/`
        champion.splashCenteredImg = `${champion_skins_url}base/images/${champion_slug}_splash_centered_0.jpg`;
        champion.squareImg = `${this.state.getVersionCDN()}/img/champion/${champion.id}.png`;
        champion.loadingImg = `${this.state.getCDN()}/img/champion/loading/${champion.id}_0.jpg`;
        champion.skins = champion.skins?.map((skin: any) => ({
                url: skin.num==0?champion.splashCenteredImg : `${champion_skins_url}skin${skin.num<10?`0${skin.num}`:skin.num}/images/${champion_slug}_splash_centered_${skin.num}.jpg`,
                id: skin.num.toString()
            })) || []
        return champion;
    }
    extendChampionLocal(champion: Champion, skin_id?: number): Champion {
        
        champion.splashImg = `/cache/${this.versions.n.champion}/champion/${champion.id}_splash.jpg`;
        champion.squareImg = `/cache/${this.versions.n.champion}/champion/${champion.id}_square.png`;
        champion.loadingImg = `/cache/${this.versions.n.champion}/champion/${champion.id}_loading.jpg`;
        champion.skins?.forEach((skin: any) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (skin_id && skin_id > 0 && skin.id == skin_id.toString()) {
                champion.splashCenteredImg = `/cache/${this.versions.n.champion}/champion/${champion.id}_SKIN_${skin.num}.jpg`
                if (!fs.existsSync(join(process.cwd(), champion.splashCenteredImg))){
                    champion.splashCenteredImg = `/cache/${this.versions.n.champion}/champion/${champion.id}_SKIN_0.jpg`
                }
                if(skin.name!=='default') champion.name = skin.name
            }
        })
        if(champion.splashCenteredImg===undefined){
            champion.splashCenteredImg = `/cache/${this.versions.n.champion}/champion/${champion.id}_SKIN_0.jpg`
        }
        return champion;
    }

    getSummonerSpellById(id: number): Spell | null {
        return this.summonerSpells.find((spell: Spell) => {
            if (parseInt(spell.key as string, 10) === id) {
                return this.extendSummonerSpellLocal(spell);
            }
        }) || null;
    }

    extendSummonerSpell(spell: Spell): Spell {
        spell.icon = `${this.state.getVersionCDN()}/img/spell/${spell.id}.png`;
        return spell;
    }
    extendSummonerSpellLocal(spell: Spell): Spell {
        spell.icon = `/cache/${this.versions.n.item}/spell/${spell.id}.png`;
        return spell;
    }

    async checkLocalCache(): Promise<void> {
        const patch = this.state.data.meta.version.champion;

        const patchFolder = `./cache/${patch}`;
        const patchFolderChampion = patchFolder + '/champion';
        const patchFolderSpell = patchFolder + '/spell';

        if (fs.existsSync(patchFolder)) {
            log.info(`Directory ${patchFolder} exists already. Please remove it if you want to re-download it.`);
            return;
        }
        try {
            fs.mkdirSync('./cache');
        } catch (e) {
            log.debug('Directory ./cache exists already or cannot be created.');
        }
        fs.mkdirSync(patchFolder);
        fs.mkdirSync(patchFolderChampion);
        fs.mkdirSync(patchFolderSpell);

        log.info('Download process started. This could take a while. Downloading to: ' + patchFolder);

        const MAX_RETRIES = 3;
        const CONCURRENCY = 15;

        interface DownloadTask {
            url: string;
            path: string;
            retries: number;
        }

        const downloadFile = async (task: DownloadTask): Promise<void> => {
            const resp = await needle('get', task.url, {
                // eslint-disable-next-line @typescript-eslint/camelcase
                open_timeout: 10000,
                // eslint-disable-next-line @typescript-eslint/camelcase
                read_timeout: 30000
            });
            if(resp.statusCode !== 200) return;
            const out = fs.createWriteStream(task.path);
            out.write(resp.raw);
            out.close();
        };

        const taskQueue: DownloadTask[] = [];

        this.champions.forEach(champion => {
            champion = this.extendChampion(champion);
            taskQueue.push({ url: champion.loadingImg, path: `${patchFolderChampion}/${champion.id}_loading.jpg`, retries: 0 });
            taskQueue.push({ url: champion.splashImg, path: `${patchFolderChampion}/${champion.id}_splash.jpg`, retries: 0 });
            taskQueue.push({ url: champion.splashCenteredImg, path: `${patchFolderChampion}/${champion.id}_centered_splash.jpg`, retries: 0 });
            taskQueue.push({ url: champion.squareImg, path: `${patchFolderChampion}/${champion.id}_square.png`, retries: 0 });
            champion.skins?.forEach(skin => {
                taskQueue.push({ url: skin.url, path: `${patchFolderChampion}/${champion.id}_SKIN_${skin.id}.jpg`, retries: 0 });
            });
        });

        this.summonerSpells.forEach(spell => {
            spell = this.extendSummonerSpell(spell);
            taskQueue.push({ url: spell.icon, path: `${patchFolderSpell}/${spell.id}.png`, retries: 0 });
        });

        const totalTasks = taskQueue.length;
        log.info(`Downloading ${totalTasks} assets from datadragon!`);

        const bar = new cliProgress.Bar({
            format: 'Downloading assets [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
        });

        let completed = 0;
        const failedTasks: Array<{ url: string; error: string }> = [];

        // Worker pool: each worker pulls tasks from the shared queue
        const runWorker = async (): Promise<void> => {
            while (taskQueue.length > 0) {
                const task = taskQueue.shift();
                if (!task) break;

                try {
                    await downloadFile(task);
                    completed++;
                    bar.update(completed);
                } catch (err) {
                    const errorMsg = (err as any)?.message || String(err);
                    if (task.retries < MAX_RETRIES) {
                        // Re-queue with incremented retry count
                        const delay = Math.pow(2, task.retries) * 500; // 500ms, 1s, 2s
                        await new Promise(resolve => setTimeout(resolve, delay));
                        task.retries++;
                        taskQueue.push(task); // Back to the queue
                        log.debug(`Retry ${task.retries}/${MAX_RETRIES} for: ${path.basename(task.path)}`);
                    } else {
                        // Exhausted retries — log and move on
                        completed++;
                        bar.update(completed);
                        failedTasks.push({ url: task.url, error: errorMsg });
                        log.warn(`Failed after ${MAX_RETRIES} retries: ${path.basename(task.path)}`);
                    }
                }
            }
        };

        bar.start(totalTasks, 0);

        // Launch concurrent workers
        const workers: Promise<void>[] = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            workers.push(runWorker());
        }
        await Promise.all(workers);

        bar.stop();

        if (failedTasks.length > 0) {
            log.warn(`${failedTasks.length} assets failed to download after ${MAX_RETRIES} retries.`);
            failedTasks.forEach(f => log.debug(`  Failed: ${f.url} — ${f.error}`));
        }

        log.info(`Download complete: ${totalTasks - failedTasks.length}/${totalTasks} assets downloaded successfully.`);
    }
}

export default DataDragon;
