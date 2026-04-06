const Scanner = {
    reader: new ZXing.BrowserMultiFormatReader(),
    start: async function(callback) {
        const container = document.getElementById('camera-container');
        container.style.display = 'flex';
        try {
            const devices = await this.reader.listVideoInputDevices();
            const id = devices.length > 1 ? devices[1].deviceId : devices[0].deviceId;
            this.reader.decodeFromVideoDevice(id, 'camera-video', (res) => {
                if(res) { this.stop(); callback(res.text); }
            });
        } catch(e) { alert("摄像头权限开启失败"); this.stop(); }
    },
    stop: function() {
        this.reader.reset();
        document.getElementById('camera-container').style.display = 'none';
    }
};
