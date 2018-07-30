import dom from './util/dom-core'
import util from './util/index'
import { error } from './debug/index'

const imageHandler = {
  /**
   * 添加图片到编辑器中
   * @param src 图片URL地址或base64数据
   * @returns {*} 当前光标元素
   */
  create (src, callback) {
    const id = util.randStr('zxeditor_img_')
    const $img = dom.createElm('img', {
      src: src,
      width: '100%',
      height: 'auto',
      id: id
    })
    $img.onload = function () {
      callback(null, $img)
    }
    $img.onerror = function (e) {
      callback(e)
    }
  },

  /**
   * 判断文件是否为图片格式
   * @param file 图片文件名称
   * @return {boolean}
   */
  isImage (file) {
    // 图片类型
    const imageType = ['png', 'pneg', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    // 文件后缀
    let suf = util.getSuffix(file)
    // 判断文件名是否带有?search
    if (/(\w+)\?/.test(suf)) suf = RegExp.$1
    return imageType.indexOf(suf) > -1 ? true : false
  },

  /**
   * base64转换为Blob数据
   * @param base64Data
   * @returns {*}
   */
  toBlobData (base64Data) {
    // base64数据格式:
    // "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAkGB+wgHBgkIBwgKCgkLDRYPDQw//9k="
    let type, onlyData
    if (/^data:(\w+\/\w+);base64,(.+)/.test(base64Data)) {
      type = RegExp.$1
      onlyData = RegExp.$2
    } else {
      console.error(`toBlobData(data), ${base64Data} is not base64 data!`)
      return null
    }

    let data = window.atob(onlyData)
    let ia = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      ia[i] = data.charCodeAt(i)
    }
    return new Blob([ia], {type: type})
  },

  /**
   * 图片文件数据转为base64
   * @param files原始文件数据数组
   * @param callback
   */
  filesToBase64 (files, opts, callback, debug) {
    if (!files || !files.length) {
      callback([{code: 2, msg: `files is not valid`}])
      return
    }
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    let len = files.length
    let count = 0
    let _errs = []
    let arr = []
    let i, file
    for (i = 0; i < len; i++) {
      file = files[i]
      // 非图片文件
      if (!imageHandler.isImage(file.name)) {
        _errs.push({code: 3, msg: `files[${i}]: ${file.name} is not Image File!`})
        _checkCount()
        continue
      }

      EXIF.getData(file, function () {
        let info = EXIF.getAllTags(this)
        let orientation = info.Orientation
        if (debug) {
          debug.log(`EXIF[Orientation] ${orientation}`)
          debug.log(info)
        }

        // 拍摄方向
        opts.orientation = orientation

        // 转换为Base64数据
        _fileToBase64(file, opts, (err, res) => {
          if (err) {
            _errs.push(err)
          } else if (res) {
            arr.push(res)
          }
          _checkCount()
        })
      })
    } // end of for

    /**
     * check 文件是否处理完成
     * @private
     */
    function _checkCount () {
      count++
      if (len === count) callback(
        _errs.length ? _errs : null,
        arr.length ? arr : null
      )
    }
  }
}

// 图片文件数据转为base64
function _fileToBase64 (file, opts, callback) {
  // 实例化FileReader
  const reader = new FileReader()
  // readAsDataURL方法用于读取指定Blob或File的内容。
  // 当读操作完成，readyState变为DONE, loadend被触发，
  // 此时result属性包含数据：URL以base64编码的字符串表示文件的数据。
  reader.readAsDataURL(file)
  reader.onload = function () {
    opts.type = file.type
    opts.size = file.size
    opts.name = file.name
    // 获取图片信息
    _getImageInfo(this.result, opts, (err, res) => {
      if (err) {
        callback(e)
        return
      }
      _handleImageData(res, opts, callback)
    })
  }

  reader.onerror = function (e) {
    callback(e)
  }
}

/**
 * 创建图片，并获取信息
 * @param fileBase64Data
 * @param opts
 * @param callback
 * @private
 */
function _getImageInfo (fileBase64Data, opts, callback) {
  const $img = new Image()
  // 创建图片
  $img.src = fileBase64Data
  $img.setAttribute('alt', opts.name)
  // 加载图片
  $img.onload = function (e) {
    // 旋转图片，并转为base64
    let result = rotateAndToBase64($img, opts)
    callback(null, result)
  }

  $img.onerror = function (e) {
    callback(e)
  }
}

// 处理图片数据
/**
 * 处理图片数据，裁剪压缩
 * @param imageInfo 图片信息
 * @param opts 压缩参数
 * @param callback
 * @private
 */
function _handleImageData (imageInfo, opts, callback) {
  // 文件类型
  let dataType = imageInfo.type

  // 不做任何处理，如gif文件
  // ...

  // 计算图片缩放或裁剪位置、尺寸
  let res = calculateCropInfo(imageInfo.width, imageInfo.height, opts)

  let canvas = imageInfo.element

  let scaling = 2
  let sw = res.sw
  let sh = res.sh
  let sx = res.sx
  let sy = res.sy

  if (res.scaling > scaling) {
    scaling = res.scaling
    do {
      canvas = createCanvas(canvas, {
        cw: res.cw * scaling,
        ch: res.ch * scaling,
        sx: sx,
        sy: sy,
        sw: sw,
        sh: sh
      })
      sw = canvas.width
      sh = canvas.height
      sx = sy = 0
      scaling -= 1
    } while (scaling > 2)
  }
  canvas = createCanvas(canvas, {
    cw: res.cw,
    ch: res.ch,
    sx: sx,
    sy: sy,
    sw: sw,
    sh: sh
  })

  let base64 = canvas.toDataURL(dataType)
  let blob = imageHandler.toBlobData(base64, dataType)

  callback(null, {
    element: canvas,
    type: dataType,
    width: res.cw,
    height: res.ch,
    data: blob,
    base64: base64,
    size: blob.size,
    url: blobToUrl(blob),
    // 原始图片数据
    rawdata: imageInfo
  })
}

/**
 * 创建blob url
 * @param blob Blob数据
 * @returns {*}
 */
function blobToUrl (blob) {
  return URL.createObjectURL(blob)
}

/**
 * 计算生成图片裁剪位置及尺寸
 * @param {Number} iw // 原图宽
 * @param {Number} ih // 原图高
 * @param {Object} opts 压缩，裁剪尺寸的参数
 */
function calculateCropInfo (iw, ih, opts) {
  // 目标图片尺寸
  let targetWidth = util.int(opts.width)
  let targetHeight = util.int(opts.height)

  // 提示：图片实际尺寸，小于目标尺寸
  if (!opts.clip && (targetWidth > 0 && iw < targetWidth)
    && (targetHeight > 0 && ih < targetHeight)) {
    return {
      sx: 0,
      sy: 0,
      sw: iw,
      sh: ih,
      scaling: 1,
      cw: iw,
      ch: ih
    }
  }

  // 缩放比列
  let scaling = 1

  // 图片开始裁剪位置 x,y坐标
  let sx = 0
  let sy = 0
  // canvas 尺寸
  let canvasWidth = iw
  let canvasHieght = ih
  // 等比缩放后的图片尺寸
  let sw = 0
  let sh = 0

  // 裁剪图片代码 **********************************
  // 等比缩放到合适大小，在居中裁剪
  if (targetWidth > 0 && targetHeight > 0) {
    // canvas的尺寸即为裁剪设置尺寸
    canvasWidth = targetWidth
    canvasHieght = targetHeight

    // 按目标宽度调整图片尺寸：图片宽度 === 裁剪框宽
    sw = targetWidth
    sh = Math.floor(targetWidth * ih / iw)

    scaling = ratio(iw, targetWidth)

    // 图片高度超出裁剪框，能正常裁剪
    if (sh >= targetHeight) {
      sx = 0
      sy = util.int((sh - targetHeight) / 2 * scaling)
    }
    // 不满足裁剪需求，需重新缩放：图片高度 === 裁剪框高度
    else {
      scaling = ratio(ih, targetHeight)
      sw = Math.floor(targetHeight * iw / ih)
      sh = targetHeight
      sx = util.int((sw - targetWidth) / 2 * scaling)
      sy = 0
    }

  }
  // 缩放图片代码 **********************************
  // 只设置了宽度
  else if (targetWidth > 0) {
    scaling = ratio(iw, targetWidth)
    canvasWidth = targetWidth
    canvasHieght = Math.floor(targetWidth * ih / iw)
  }
  // 只设置了宽度
  else if (targetHeight > 0) {
    scaling = ratio(ih, targetHeight)
    canvasWidth = Math.floor(targetHeight * iw / ih)
    canvasHieght = targetHeight
  }

  return {
    sx: sx, // 裁剪开始x坐标
    sy: sy, // 裁剪开始y坐标
    sw: util.int(canvasWidth * scaling),
    sh: util.int(canvasHieght * scaling),
    scaling: scaling,
    cw: canvasWidth,
    ch: canvasHieght
  }
}

/**
 * 创建Canvas
 * @param $el Image对象或Canvas元素
 * @param p 裁剪参数
 * @returns {Element}
 */
function createCanvas ($el, p) {
  const canvas = document.createElement('canvas')
  canvas.width = p.cw
  canvas.height = p.ch
  const ctx = canvas.getContext('2d');
  ctx.drawImage($el, p.sx, p.sy, p.sw, p.sh, 0, 0, canvas.width, canvas.height);
  return canvas
}

/**
 * 缩放比列
 * @param {Number} numerator 分子
 * @param {Number} denominator 分母
 */
function ratio (numerator, denominator) {
  return parseInt(numerator / denominator * 10000) / 10000
}

/**
 * 将图片转为base64数据，
 * 根据opts.orientation决定图片是否旋转
 * @param $img
 * @param opts
 * @returns {Object}
 */
function rotateAndToBase64 ($img, opts) {
  const $canvas = dom.createElm('canvas')
  const ctx = $canvas.getContext('2d')
  let imgWidth = $canvas.width = $img.width
  let imgHeight = $canvas.height = $img.height
  // 如果方向角不为 1，都需要进行旋转 added by lzk
  if (opts.orientation > 1) {
    switch(opts.orientation) {
      // 旋转90度
      case 6:
        $canvas.width = imgHeight
        $canvas.height = imgWidth
        ctx.rotate(Math.PI / 2)
        // (0, -imgHeight) 从旋转原理图那里获得的起始点
        ctx.drawImage($img, 0, -imgHeight, imgWidth, imgHeight)
        break
      // 旋转180度
      case 3:
        ctx.rotate(Math.PI)
        ctx.drawImage($img, -imgWidth, -imgHeight, imgWidth, imgHeight)
        break;
      case 8:     // 旋转-90(270)度
        $canvas.width = imgHeight
        $canvas.height = imgWidth
        ctx.rotate(3 * Math.PI / 2)
        ctx.drawImage($img, -imgWidth, 0, imgWidth, imgHeight)
        break
    }
  } else {
    ctx.drawImage($img, 0, 0, imgWidth, imgHeight)
  }
  return {
    element: $canvas,
    data: $canvas.toDataURL(opts.type),
    width: $canvas.width,
    height: $canvas.height,
    type: opts.type,
    size: opts.size
  }
}

export default imageHandler