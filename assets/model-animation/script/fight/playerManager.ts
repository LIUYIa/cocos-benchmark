import { _decorator, Component, Node, Prefab, instantiate, CameraComponent, Tween, Vec3, easing, game, CCString, profiler, SkinningModelComponent, SkeletalAnimationComponent } from 'cc';
import { player } from './player';
import { SubPackageManager } from '../framework/util/subPackageManager';
import ResManager from '../framework/util/resManager';
import { StorageManager } from '../framework/config/storageManager';
import { gameLogic } from '../framework/util/gameLogic';
import { constants } from '../framework/util/constants';
const { ccclass, property } = _decorator;

const CAMERA_MOVE_PER_PERSON = 100; //每多少人摄像机抬高一次

const ANTI_KEY = 'anti-aliasing';

@ccclass('playerManager')
export class playerManager extends Component {
    /* class member could be defined like this */
    // dummy = '';

    /* use `property` decorator if your want the member to be serializable */
    // @property
    // serializableDummy = 0;
    arrModel: Prefab[] = [];

    @property([CCString])
    arrName: string[] = [];

    @property(CameraComponent)
    mainCamera: CameraComponent = null;

    //美术的面数及顶点数
    artTriangle: number = 0;
    artVertex: number = 0;
    people: number = 0;
    isStart = false;

    currentLevel: number = 0;
    tweenCamera: Tween;
    posCameraOrigin: Vec3;

    isEnableInstacing = false;

    private _prevPeopleRate: number = 0; //人数除以30等于多少倍

    set enableInstancing (value: boolean) {
        this.isEnableInstacing = value;

        this.node.children.forEach((nodePlayer)=>{
            let playerScript = nodePlayer.getComponent(player);
            if (playerScript) {
                playerScript.changeInstancingBatch(value);
            }
        })
    }

    get enableInstancing () {
        return this.isEnableInstacing;
    }

    isEnableShadow = true;

    set enableShadow (value: boolean) {
        this.isEnableShadow = value;

        this.node.children.forEach((nodePlayer)=>{
            let playerScript = nodePlayer.getComponent(player);
            if (playerScript) {
                playerScript.changeShadow(value);
            }
        })
    }

    get enableShadow () {
        return this.isEnableShadow;
    }

    isEnableAntiAliasing = false;

    set enableAntiAliasing (value: boolean) {
        this.isEnableAntiAliasing = value;

        StorageManager.instance.setGlobalData(ANTI_KEY, value);

        if (cc.sys.isBrowser) {
            window.location.reload();
        } else if (cc.sys.platform === cc.sys.WECHAT_GAME) {
            console.log('reload!');
            window.wx.exitMiniProgram({
                complete: ()=>{
                    
                }
            });
        } else if (cc.sys.isNative) {
            window.__restartVM();
        }
    }

    get enableAntiAliasing () {
        return this.isEnableAntiAliasing;
    }

    onLoad () {
        ResManager.resPath = 'model-animation/';
        StorageManager.instance.start();

        this.isEnableAntiAliasing = StorageManager.instance.getGlobalData(ANTI_KEY) || false;
    }

    start () {
        // Your initialization goes here.
        SubPackageManager.instance.loadModelPackage(()=>{
            this.arrName.forEach((name)=>{
                ResManager.getModel(name, (err, prefab)=>{
                    if (!err) {
                        this.arrModel.push(prefab);

                        if (this.arrModel.length === this.arrName.length) {
                            this.addPlayerGroup();
    
                            this.isStart = true;
                        }
                    }
                });
            });
        });

        this.posCameraOrigin = this.mainCamera.node.position.clone();
    }

    addPlayerGroup () {
        this.arrModel.forEach((pfModel)=>{
            let model = instantiate(pfModel) as Node;
            model.parent = this.node;

            let playerScript = model.getComponent(player);
            playerScript.show(this);

            this.artTriangle += playerScript.triangle;
            this.artVertex += playerScript.vertex;

            this.people++;

            if (Math.floor(this.people / CAMERA_MOVE_PER_PERSON) > this.currentLevel) {
                //触发镜头拉高
                this.moveUpCamera();
            }
        })

        let rate = Math.floor(this.people / 30);

        if (rate > this._prevPeopleRate) {
            let obj = {
                'Fps': Math.round(profiler._stats.fps.counter.value).toString(),     
                'Drawcall' : profiler._stats.draws.counter.value.toString(),
                'Instancing' : profiler._stats.instances.counter.value.toString(),
                'Triangle' : profiler._stats.tricount.counter.value.toString(),
                'GFXMem' : profiler._stats.textureMemory.counter.value.toFixed(1).toString(),
                'GameLogic' : profiler._stats.logic.counter.value.toFixed(2).toString(),
                'ArtTriangle' : this.artTriangle.toString(),
                'Vertex' : this.artVertex.toString(),
                'People' : this.people.toString(),            
            }
            
            this.scheduleOnce(()=>{
                gameLogic.customEventStatistics(constants.EVENT_TYPE.PERFORMANCE_PARAMETER, obj);
            }, 0.5);

            this._prevPeopleRate = rate;
        }
    }

    resetPlayer () {
        this.node.destroyAllChildren();

        this.artTriangle = 0;
        this.artVertex = 0;
        this.people = 0;
        this.currentLevel = 0;

        this.mainCamera.node.position = this.posCameraOrigin;

        this._prevPeopleRate = 0;
    }

    reducePlayer () {
        this.arrName.forEach((name)=>{
            let nodePlayer = this.node.getChildByName(name);
            if (!nodePlayer) {
                return;
            }

            let playerScript = nodePlayer.getComponent(player);
            this.artTriangle -= playerScript.triangle;
            this.artVertex -= playerScript.vertex;

            nodePlayer.destroy();

            this.people--;

            if (this.currentLevel > Math.floor(this.people / CAMERA_MOVE_PER_PERSON)) {
                this.currentLevel = Math.floor(this.people / CAMERA_MOVE_PER_PERSON);

                let pos = this.mainCamera.node.forward.clone().negative().multiplyScalar(8 * this.currentLevel);

                pos.add(this.posCameraOrigin);

                if (this.tweenCamera) {
                    this.tweenCamera.stop();
                    this.tweenCamera = null;
                }
        
                this.tweenCamera = new Tween(this.mainCamera.node).to(0.2, {position: pos}).start();
            }
        });
    }

    moveUpCamera () {
        this.currentLevel++;

        let direction = this.mainCamera.node.forward.clone().negative().multiplyScalar(8);
        direction.add(this.mainCamera.node.position);
        

        if (this.tweenCamera) {
            this.tweenCamera.stop();
            this.tweenCamera = null;
        }

        this.tweenCamera = new Tween(this.mainCamera.node).to(0.2, {position: direction}).start();
    }

    addDancer () {
        ResManager.getModel('dance1', (err, prefab)=>{
            if (!err) {
                let model = instantiate(prefab) as Node;
                model.parent = this.node;
                model.setScale(new Vec3(2.5, 2.5, 2.5));
                model.setPosition(new Vec3(2.4,0,2));
            }
        });
    }

    // enableInstancing (isEnable: boolean) {
    //     // this.arrName.forEach((name)=>{
    //     //     let nodePlayer = this.node.getChildByName(name);

    //     //     nodePlayer.getComponent(player).changeInstancingBatch(isEnable);
    //     // });
    //     this.isEnableInstacing = false;

    //     this.node.children.forEach((nodePlayer)=>{
    //         let playerScript = nodePlayer.getComponent(player);
    //         if (playerScript) {
    //             playerScript.changeInstancingBatch(isEnable);
    //         }
    //     })
    // }

    // update (deltaTime: number) {
    //     // Your update function goes here.
    // }
}
