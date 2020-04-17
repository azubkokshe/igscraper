const request = require('request');
const fetch   = require('node-fetch');
const fs      = require('fs');
const md5     = require('md5');
const pdf     = require("pdf-creator-node");
const moment  = require("moment");
let dataExp = /window\._sharedData\s?=\s?({.+);<\/script>/;

let __DEBUG = false;

let html = fs.readFileSync('template.html', 'utf8');

function getPostData(url) {
    return new Promise(function (resolve, reject) {
        if (__DEBUG) {
            let body = fs.readFileSync('export.txt');
            return resolve(JSON.parse(body));
        }
        request(url, function (err, response, body) {
            if (err) { return reject(err); }

            let data = scrape(body);

            if (!data) {
                return reject(Error("Нет данных"));
            }
            resolve(data);
        });

    })
}

function scrape(html) {
    try {
        let dataString = html.match(dataExp)[1];
        fs.writeFileSync('export.txt', dataString, (err)=> {
            if (err) throw err;
            console.log('The file has been saved!');;
        });

        let json = JSON.parse(dataString);
        return json;
    }
    catch (e) {
        return null;
    }

    return null;
}

const getData = async url => {
    //Обработка ошибок
    try {
        fetch(url).then(image => image.body.pipe(fs.createWriteStream(md5(url) + ".jpg")).on('close', () => Promise.resolve()));
    } catch (error) {
        console.log(error);
    }
};

function makePdf(images, owner, timeStamp, caption) {
    if (images && images.length > 0) {
        images[images.length-1].class = '';
    }

    return new Promise(async function (resolve, reject) {
        let document = {
            html: html,
            path: "./output.pdf",
            data: {
                users: images,
                caption: caption,
            },
        };

        moment.locale('ru');
        console.log("timeStamp is: " + timeStamp);

        let options = {
            format: "A4",
            orientation: "portrait",
            border: "10mm",
            header: {
                height: "15mm",
                contents: `<div style="text-align: center;">${owner.name} (<a href="https://www.instagram.com/${owner.username}/">${owner.username}</a>)</div>`
            },
            footer: {
                "height": "18mm",
                "contents": {
                    default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span> ' +
                                `<div style="text-align: right; font-size: 11px; float: right;">Опубликовано: ${moment(timeStamp*1000).format('llll')}</div><br>
                                <div style="text-align: right; font-size: 11px; float: right;">Сгенерировано: ${moment().format('llll')}</div>`
                }
            }
        };

        pdf.create(document, options)
            .then(res => {

            })
            .catch(error => {
                console.error(error);
                reject(error);
            });
    })
}

function extractOwner(data) {
    let result = {};
    try {
        if (data &&
            data.owner &&
            data.owner.id &&
            data.owner.username &&
            data.owner.profile_pic_url &&
            data.owner.full_name) {

            result.id = data.owner.id;
            result.name = data.owner.full_name;
            result.username = data.owner.username;
            result.avatar = data.owner.profile_pic_url;
        }
    } catch (e) {
        console.log("Error in json data");
    } finally {
        return result;
    }
}

function extractCaption(data) {
    let result = '';
    try {
        if (data &&
            data.edge_media_to_caption &&
            data.edge_media_to_caption.edges &&
            data.edge_media_to_caption.edges[0].node &&
            data.edge_media_to_caption.edges[0].node.text) {

            result = data.edge_media_to_caption.edges[0].node.text;
        }
    } catch (e) {
        console.log("Error in json data");
    } finally {
        return result;
    }
}

getPostData(process.argv[2]).then(data => {
    if (data &&
        data.entry_data &&
        data.entry_data.PostPage &&
        data.entry_data.PostPage[0].graphql &&
        data.entry_data.PostPage[0].graphql.shortcode_media &&
        data.entry_data.PostPage[0].graphql.shortcode_media.__typename &&
        data.entry_data.PostPage[0].graphql.shortcode_media.taken_at_timestamp) {

        let media = data.entry_data.PostPage[0].graphql.shortcode_media;

        let timeStamp = media.taken_at_timestamp;
        let owner     = extractOwner(media);
        let caption   = extractCaption(media);

        let images = [];

        let type  = media.__typename;

        if (type === 'GraphSidecar') {
            if (media.edge_sidecar_to_children &&
                media.edge_sidecar_to_children.edges) {
                let edges = media.edge_sidecar_to_children.edges;

                edges.forEach(item => {
                    let node = item.node;
                    if (node) {
                        if (node.__typename === 'GraphImage') {
                            if (node.display_resources  && node.display_resources[0].src) {
                                images.push({url : node.display_resources[0].src, title : '', class: 'break-after'})
                            }
                        } else if (node.__typename === 'GraphVideo') {
                            if (node.display_resources && node.display_resources[0].src) {
                                images.push({url : node.display_resources[0].src, title : '', class: 'break-after'})
                            }
                        }
                    }
                });

            }
        } else if (type === 'GraphVideo') {
            if (media.display_resources &&
                media.display_resources[0].src) {
                images.push({url : media.display_resources[0].src, title : '', class: ''});
            }
        } else if (type === 'GraphImage') {
            if (media.display_resources &&
                media.display_resources[0].src) {
                images.push({url : media.display_resources[0].src, title : '', class: ''});
            }
        }

        if (images) {
            makePdf(images, owner, timeStamp, caption).then(res => {

            });
        }
    } else {
        throw "Приватный пост или неизвестный формат"
    }
}).catch(err => {
    console.log("Произошла ошибка: " + err)
});