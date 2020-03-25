var ffprobe = require('ffprobe'),
    ffprobeStatic = require('ffprobe-static');

// console.log(ffprobeStatic);

ffprobe('./download/Makeup Mirror/62380742656_Makeup Mirror_₹649.58.mp4', { path: ffprobeStatic.path })
  .then(function (info) {
    console.log(info);
    /***
    {
      streams: [
        {
          index: 0,
          codec_name: 'h264',
          codec_long_name: 'H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10',
          profile: 'High',
          codec_type: 'video',
          codec_time_base: '1/50',
          codec_tag_string: 'avc1',
          codec_tag: '0x31637661',
          width: 1280,
          height: 720,
          coded_width: 1280,
          coded_height: 720,
          has_b_frames: 2,
          pix_fmt: 'yuv420p',
          level: 31,
          chroma_location: 'left',
          refs: 1,
          is_avc: 'true',
          nal_length_size: '4',
          r_frame_rate: '25/1',
          avg_frame_rate: '25/1',
          time_base: '1/12800',
          start_pts: 0,
          start_time: '0.000000',
          duration_ts: 563712,
          duration: '44.040000',
          bit_rate: '683928',
          bits_per_raw_sample: '8',
          nb_frames: '1101',
          disposition: [Object],
          tags: [Object]
        },
        {
          index: 1,
          codec_name: 'aac',
          codec_long_name: 'AAC (Advanced Audio Coding)',
          profile: 'LC',
          codec_type: 'audio',
          codec_time_base: '1/44100',
          codec_tag_string: 'mp4a',
          codec_tag: '0x6134706d',
          sample_fmt: 'fltp',
          sample_rate: '44100',
          channels: 2,
          channel_layout: 'stereo',
          bits_per_sample: 0,
          r_frame_rate: '0/0',
          avg_frame_rate: '0/0',
          time_base: '1/44100',
          start_pts: 0,
          start_time: '0.000000',
          duration_ts: 1941503,
          duration: '44.025011',
          bit_rate: '48120',
          max_bit_rate: '48120',
          nb_frames: '1898',
          disposition: [Object],
          tags: [Object]
        }
      ]
    }
    */
  })
  .catch(function (err) {
    console.error(err);
  })